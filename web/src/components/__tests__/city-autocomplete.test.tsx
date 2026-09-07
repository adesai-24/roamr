import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { fakeGeocodingProvider } from "@/lib/geocoding/fake";
import type { GeocodeResult } from "@/lib/geocoding/types";

// The component imports the server action for its default search.
vi.mock("@/lib/cities/actions", () => ({
  searchCitiesAction: vi.fn(),
  resolveCityAction: vi.fn(),
}));

const DEBOUNCE_MS = 300;

let cities: GeocodeResult[];

beforeEach(async () => {
  vi.useFakeTimers();
  // Real geocoder shapes, no network: exactly what the fake provider is for.
  cities = await fakeGeocodingProvider.searchCities("chi");
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the debounce fire and the search promise settle. */
async function advance(ms = DEBOUNCE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function setup(overrides: Partial<React.ComponentProps<typeof CityAutocomplete>> = {}) {
  const onSelect = vi.fn();
  const search = vi.fn(async () => cities);
  render(<CityAutocomplete onSelect={onSelect} search={search} {...overrides} />);
  return { onSelect, search, input: screen.getByRole("combobox") };
}

describe("CityAutocomplete debouncing", () => {
  it("waits for a pause in typing instead of searching per keystroke", async () => {
    const { search, input } = setup();

    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.change(input, { target: { value: "ch" } });
    fireEvent.change(input, { target: { value: "chi" } });

    await advance(DEBOUNCE_MS - 1);
    expect(search).not.toHaveBeenCalled();

    await advance(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("chi", expect.any(AbortSignal));
  });

  it("does not search below the minimum query length", async () => {
    const { search, input } = setup();

    fireEvent.change(input, { target: { value: "c" } });
    await advance();

    expect(search).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("aborts a request already in flight when the query changes", async () => {
    let captured: AbortSignal | undefined;
    const search = vi.fn(async (_query: string, signal: AbortSignal) => {
      captured = signal;
      return cities;
    });
    render(<CityAutocomplete onSelect={vi.fn()} search={search} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "chi" } });
    await advance();
    expect(captured?.aborted).toBe(false);

    fireEvent.change(input, { target: { value: "tok" } });
    expect(captured?.aborted).toBe(true);
  });

  it("ignores a stale response that lands after the query moved on", async () => {
    const onSelect = vi.fn();
    const search = vi.fn(async () => cities);
    render(<CityAutocomplete onSelect={onSelect} search={search} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "chi" } });
    await advance();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);

    fireEvent.change(input, { target: { value: "c" } });
    await advance();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

describe("CityAutocomplete keyboard navigation", () => {
  it("moves through options and selects the active one with Enter", async () => {
    const results: GeocodeResult[] = [
      ...(await fakeGeocodingProvider.searchCities("chicago")),
      ...(await fakeGeocodingProvider.searchCities("tokyo")),
    ];
    const onSelect = vi.fn();
    render(<CityAutocomplete onSelect={onSelect} search={vi.fn(async () => results)} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "ci" } });
    await advance();

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    // The first match is active as soon as results arrive, so Enter alone works.
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[1]?.id ?? "",
    );

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(results[1]);
    expect(input).toHaveValue(results[1]?.displayName);
  });

  it("wraps from the last option back to the first", async () => {
    const results: GeocodeResult[] = [
      ...(await fakeGeocodingProvider.searchCities("chicago")),
      ...(await fakeGeocodingProvider.searchCities("tokyo")),
    ];
    render(<CityAutocomplete onSelect={vi.fn()} search={vi.fn(async () => results)} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "ci" } });
    await advance();

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("closes the list on Escape without clearing what was typed", async () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: "chi" } });
    await advance();
    expect(input).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("chi");
  });

  it("does not re-search after a selection fills the input", async () => {
    const { search, input } = setup();

    fireEvent.change(input, { target: { value: "chi" } });
    await advance();
    expect(search).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Enter" });
    await advance();
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("CityAutocomplete states", () => {
  it("says it is searching while the request is outstanding", async () => {
    let release: (value: GeocodeResult[]) => void = () => {};
    const search = vi.fn(
      () =>
        new Promise<GeocodeResult[]>((resolve) => {
          release = resolve;
        }),
    );
    render(<CityAutocomplete onSelect={vi.fn()} search={search} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "chi" } });
    await advance();
    expect(screen.getByText("Searching…")).toBeInTheDocument();

    await act(async () => {
      release(cities);
    });
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("shows an empty state rather than a blank box when nothing matches", async () => {
    render(<CityAutocomplete onSelect={vi.fn()} search={vi.fn(async () => [])} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "zzzz" } });
    await advance();

    expect(screen.getByText("No cities match that search.")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("surfaces a failed search instead of looking like no results", async () => {
    const search = vi.fn(async () => {
      throw new Error("City search is unavailable right now.");
    });
    render(<CityAutocomplete onSelect={vi.fn()} search={search} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "chi" } });
    await advance();

    expect(screen.getByRole("alert")).toHaveTextContent("City search is unavailable right now.");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("wires up the combobox pattern a screen reader expects", async () => {
    const { input } = setup();

    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute(
      "aria-controls",
      screen.getByRole("listbox", { hidden: true }).id,
    );

    fireEvent.change(input, { target: { value: "chi" } });
    await advance();

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
