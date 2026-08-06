import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil, Sparkles } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Timeline } from "../../src/components/timeline/timeline";
import type { TimelineEventConfig } from "../../src/lib/timeline-registries";
import type { TimelineEvent } from "../../src/types/timeline";
import { renderWithProviders } from "../test-utils";

vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => ({ data: { user: { id: "user-1" } } }),
}));

type FixtureType = "created" | "updated";

const REGISTRY: Record<FixtureType, TimelineEventConfig> = {
  created: { icon: Sparkles, labelKey: "asset.timeline.created" },
  updated: { icon: Pencil, labelKey: "asset.timeline.updated" },
};

function buildEvents(count: number): TimelineEvent<FixtureType>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${i}`,
    type: i === 0 ? "created" : "updated",
    occurredAt: new Date(2026, 0, i + 1).toISOString(),
    actorUserId: null,
    data: {},
  }));
}

describe("Timeline", () => {
  it("renders every event's translated label and groups them", () => {
    renderWithProviders(
      <Timeline
        events={buildEvents(2)}
        registry={REGISTRY}
        emptyLabel="No activity"
        searchPlaceholder="Search…"
      />,
    );

    expect(screen.getByText("Asset created")).toBeInTheDocument();
    expect(screen.getByText("Asset updated")).toBeInTheDocument();
  });

  it("shows the empty label when there are no events", () => {
    renderWithProviders(
      <Timeline
        events={[]}
        registry={REGISTRY}
        emptyLabel="No activity"
        searchPlaceholder="Search…"
      />,
    );

    expect(screen.getByText("No activity")).toBeInTheDocument();
  });

  it("hides the search box for a small list, shows it once there are more than 5 events", () => {
    const { rerender } = renderWithProviders(
      <Timeline
        events={buildEvents(3)}
        registry={REGISTRY}
        emptyLabel="No activity"
        searchPlaceholder="Search…"
      />,
    );
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();

    rerender(
      <Timeline
        events={buildEvents(6)}
        registry={REGISTRY}
        emptyLabel="No activity"
        searchPlaceholder="Search…"
      />,
    );
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });

  it("filters events by their translated label as the user types", async () => {
    renderWithProviders(
      <Timeline
        events={buildEvents(6)}
        registry={REGISTRY}
        emptyLabel="No activity"
        searchPlaceholder="Search…"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search…"), "created");

    expect(screen.getByText("Asset created")).toBeInTheDocument();
    expect(screen.queryByText("Asset updated")).not.toBeInTheDocument();
  });

  it("renders an event with getHref as a link to the related entity", () => {
    renderWithProviders(
      <Timeline
        events={buildEvents(1)}
        registry={REGISTRY}
        emptyLabel="No activity"
        searchPlaceholder="Search…"
        getHref={(event) => (event.type === "created" ? "/app/assets/related-1" : undefined)}
      />,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/assets/related-1");
  });

  it("renders an event without getHref as inert (no link)", () => {
    renderWithProviders(
      <Timeline
        events={buildEvents(1)}
        registry={REGISTRY}
        emptyLabel="No activity"
        searchPlaceholder="Search…"
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
