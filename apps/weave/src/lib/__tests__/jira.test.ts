import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import type { WeaveSettings } from "@/lib/integrations";

// ─── Mock integrations.server so we don't touch the store ─────────────────────
const mockLoadSettings = jest.fn<() => Promise<WeaveSettings>>();
jest.mock("@/lib/integrations.server", () => ({
  loadSettings: mockLoadSettings,
}));

// ─── Shared Jira config ───────────────────────────────────────────────────────
const enabledConfig = {
  eyes: { enabled: false, baseUrl: "", token: "" },
  net: { enabled: false, baseUrl: "", token: "" },
  runner: { enabled: false, baseUrl: "", token: "" },
  hub: { enabled: false, baseUrl: "", token: "" },
  confluence: { enabled: false, baseUrl: "", token: "" },
  jira: {
    enabled: true,
    baseUrl: "https://test.atlassian.net",
    token: "test-token",
    email: "qa@test.com",
    projectKey: "TST",
    statusTransitionMap: '{"active":"Start Progress","deprecated":"Close Issue"}',
  },
};

// ─── fetch mock ───────────────────────────────────────────────────────────────
// jest-environment-jsdom does not expose fetch on globalThis by default;
// assign a jest.fn() before each test suite that needs network calls.
type MockFetch = jest.MockedFunction<typeof fetch>;
let mockFetch: MockFetch;

function installFetch() {
  mockFetch = jest.fn() as MockFetch;
  (globalThis as unknown as { fetch: MockFetch }).fetch = mockFetch;
}

function removeFetch() {
  delete (globalThis as unknown as { fetch?: MockFetch }).fetch;
}

// ─── createIssue ─────────────────────────────────────────────────────────────

describe("jira.server — createIssue", () => {
  beforeEach(() => {
    mockLoadSettings.mockResolvedValue(enabledConfig);
    installFetch();
  });

  afterEach(() => {
    removeFetch();
    jest.clearAllMocks();
  });

  it("calls POST /rest/api/3/issue with correct Basic auth header", async () => {
    const mockIssue = { id: "10001", key: "TST-1", self: "https://test.atlassian.net/rest/api/3/issue/10001" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockIssue,
    } as Response);

    const { createIssue } = await import("@/lib/jira.server");
    const result = await createIssue({
      summary: "Test issue",
      issuetype: { name: "Story" },
      project: { key: "TST" },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/api/3/issue");
    expect(init.method).toBe("POST");
    const authHeader = (init.headers as Record<string, string>).Authorization;
    const expected = `Basic ${Buffer.from("qa@test.com:test-token").toString("base64")}`;
    expect(authHeader).toBe(expected);
    expect(result.key).toBe("TST-1");
  });

  it("throws when jira is disabled", async () => {
    mockLoadSettings.mockResolvedValue({
      ...enabledConfig,
      jira: { ...enabledConfig.jira, enabled: false },
    });
    const { createIssue } = await import("@/lib/jira.server");
    await expect(
      createIssue({ summary: "x", issuetype: { name: "Story" }, project: { key: "TST" } }),
    ).rejects.toThrow("disabled");
  });

  it("throws when jira token is missing", async () => {
    mockLoadSettings.mockResolvedValue({
      ...enabledConfig,
      jira: { ...enabledConfig.jira, token: "" },
    });
    const { createIssue } = await import("@/lib/jira.server");
    await expect(
      createIssue({ summary: "x", issuetype: { name: "Story" }, project: { key: "TST" } }),
    ).rejects.toThrow("token");
  });
});

// ─── getTransitions + findTransitionId ───────────────────────────────────────

describe("jira.server — getTransitions", () => {
  beforeEach(() => {
    mockLoadSettings.mockResolvedValue(enabledConfig);
    installFetch();
  });

  afterEach(() => {
    removeFetch();
    jest.clearAllMocks();
  });

  it("parses transitions from API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        transitions: [
          { id: "11", name: "Start Progress", to: { name: "In Progress" } },
          { id: "21", name: "Done", to: { name: "Done" } },
        ],
      }),
    } as Response);

    const { getTransitions } = await import("@/lib/jira.server");
    const transitions = await getTransitions("TST-1");
    expect(transitions).toHaveLength(2);
    expect(transitions[0].name).toBe("Start Progress");
    expect(transitions[1].id).toBe("21");
  });

  it("findTransitionId returns the matching id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        transitions: [
          { id: "11", name: "Start Progress", to: { name: "In Progress" } },
          { id: "21", name: "Done", to: { name: "Done" } },
        ],
      }),
    } as Response);

    const { findTransitionId } = await import("@/lib/jira.server");
    const id = await findTransitionId("TST-1", "start progress"); // case-insensitive
    expect(id).toBe("11");
  });

  it("findTransitionId returns undefined when name not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ transitions: [{ id: "11", name: "Done", to: { name: "Done" } }] }),
    } as Response);

    const { findTransitionId } = await import("@/lib/jira.server");
    const id = await findTransitionId("TST-1", "NonExistent");
    expect(id).toBeUndefined();
  });
});

// ─── getStatusTransitionMap ───────────────────────────────────────────────────

describe("jira.server — getStatusTransitionMap", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("parses the JSON status map correctly", async () => {
    mockLoadSettings.mockResolvedValue(enabledConfig);
    const { getStatusTransitionMap } = await import("@/lib/jira.server");
    const map = await getStatusTransitionMap();
    expect(map["active"]).toBe("Start Progress");
    expect(map["deprecated"]).toBe("Close Issue");
  });

  it("returns {} for invalid JSON in statusTransitionMap", async () => {
    mockLoadSettings.mockResolvedValue({
      ...enabledConfig,
      jira: { ...enabledConfig.jira, statusTransitionMap: "not-json" },
    });
    const { getStatusTransitionMap } = await import("@/lib/jira.server");
    const map = await getStatusTransitionMap();
    expect(map).toEqual({});
  });

  it("returns {} when statusTransitionMap is undefined", async () => {
    mockLoadSettings.mockResolvedValue({
      ...enabledConfig,
      jira: { ...enabledConfig.jira, statusTransitionMap: undefined },
    });
    const { getStatusTransitionMap } = await import("@/lib/jira.server");
    const map = await getStatusTransitionMap();
    expect(map).toEqual({});
  });
});
