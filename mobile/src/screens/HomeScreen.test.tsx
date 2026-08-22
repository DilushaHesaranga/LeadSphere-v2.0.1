import { render, waitFor } from "@testing-library/react-native";

jest.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    authorization: {
      profile: {
        id: "user-1",
        email: "sales@example.com",
        display_name: "Sales User",
        status: "active",
      },
      roles: [],
      teams: [],
      permissions: { "console.access": "company" },
    },
    session: { user: { id: "user-1" } },
    can: () => true,
  }),
}));

jest.mock("@/services/crm", () => ({
  crmService: { dashboard: jest.fn() },
}));

jest.mock("@/services/secureCache", () => ({
  loadCachedResource: jest.fn(),
}));

import { loadCachedResource } from "@/services/secureCache";
import { HomeScreen } from "./HomeScreen";

const loadMock = loadCachedResource as jest.Mock;

describe("HomeScreen", () => {
  beforeEach(() => loadMock.mockReset());

  it("shows an accessible loading state while dashboard data is pending", () => {
    loadMock.mockReturnValue(new Promise(() => undefined));
    const screen = render(<HomeScreen />);
    expect(screen.getByLabelText("Loading dashboard")).toBeTruthy();
  });

  it("shows a recoverable request error", async () => {
    loadMock.mockRejectedValue(new Error("Dashboard unavailable"));
    const screen = render(<HomeScreen />);
    await waitFor(() =>
      expect(screen.getByText("Dashboard unavailable")).toBeTruthy(),
    );
  });
});
