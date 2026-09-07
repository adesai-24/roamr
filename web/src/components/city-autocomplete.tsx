"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { searchCitiesAction } from "@/lib/cities/actions";
import type { GeocodeResult } from "@/lib/geocoding/types";
import { cn } from "@/lib/utils";

/** City picker. */

export type CitySearchFn = (query: string, signal: AbortSignal) => Promise<GeocodeResult[]>;

const searchViaAction: CitySearchFn = async (query) => {
  const result = await searchCitiesAction(query);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};

export interface CityAutocompleteProps {
  onSelect: (city: GeocodeResult) => void;
  /** Injectable so tests drive the component without touching a server action. */
  search?: CitySearchFn;
  label?: string;
  placeholder?: string;
  /** Long enough that typing does not fire a paid request per keystroke. */
  debounceMs?: number;
  minQueryLength?: number;
  className?: string;
}

type Status = "idle" | "loading" | "ready" | "error";

export function CityAutocomplete({
  onSelect,
  search,
  label = "City",
  placeholder = "Search for a city",
  debounceMs = 300,
  minQueryLength = 2,
  className,
}: CityAutocompleteProps) {
  const reactId = useId();
  const inputId = `city-autocomplete-${reactId}`;
  const listboxId = `city-autocomplete-listbox-${reactId}`;
  const statusId = `city-autocomplete-status-${reactId}`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const searchRef = useRef<CitySearchFn>(search ?? searchViaAction);
  useEffect(() => {
    searchRef.current = search ?? searchViaAction;
  }, [search]);

  // Choosing a city fills the input with its name.
  const skipNextSearchRef = useRef(false);

  const clearResults = useCallback(() => {
    setResults([]);
    setActiveIndex(-1);
    setStatus("idle");
    setErrorMessage(null);
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    // Clearing for a too-short query happens in the change handler instead.
    if (trimmed.length < minQueryLength) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("loading");
      setIsOpen(true);

      searchRef.current(trimmed, controller.signal).then(
        (found) => {
          // A response that arrives after the query moved on is worse than no response.
          if (controller.signal.aborted) return;
          setResults(found);
          setActiveIndex(found.length > 0 ? 0 : -1);
          setErrorMessage(null);
          setStatus("ready");
        },
        (cause: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setActiveIndex(-1);
          setErrorMessage(cause instanceof Error ? cause.message : "City search failed.");
          setStatus("error");
        },
      );
    }, debounceMs);

    // Runs on every keystroke.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, debounceMs, minQueryLength]);

  const handleSelect = useCallback(
    (city: GeocodeResult) => {
      skipNextSearchRef.current = true;
      setQuery(city.displayName);
      setResults([]);
      setActiveIndex(-1);
      setStatus("idle");
      setIsOpen(false);
      onSelect(city);
    },
    [onSelect],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }

    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      const city = results[activeIndex];
      if (city) {
        // Otherwise Enter submits whatever form the picker is sitting in.
        event.preventDefault();
        handleSelect(city);
      }
    }
  };

  const showList = isOpen && (status === "loading" || results.length > 0 || status === "ready");

  return (
    <div className={cn("relative w-full", className)}>
      <label htmlFor={inputId} className="text-foreground mb-1 block text-sm font-medium">
        {label}
      </label>

      <input
        id={inputId}
        type="text"
        role="combobox"
        // Browsers offer their own address suggestions over the listbox otherwise.
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIndex >= 0 && activeIndex < results.length
            ? optionId(activeIndex)
            : undefined
        }
        aria-describedby={statusId}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length < minQueryLength) clearResults();
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
        // 16px keeps iOS from zooming the viewport on focus.
        className={cn(
          "border-border bg-surface text-foreground placeholder:text-muted",
          "focus:border-accent focus:ring-accent/40 rounded-card min-h-12 w-full border",
          "px-3 py-3 text-base outline-none focus:ring-2",
        )}
      />

      <ul
        id={listboxId}
        role="listbox"
        aria-label={label}
        hidden={!showList}
        className={cn(
          "border-border bg-surface rounded-card absolute z-10 mt-1 w-full overflow-hidden border",
          "max-h-72 overflow-y-auto shadow-lg",
        )}
      >
        {status === "loading" && results.length === 0 ? (
          <li className="text-muted px-3 py-3 text-sm">Searching…</li>
        ) : null}

        {status === "ready" && results.length === 0 ? (
          <li className="text-muted px-3 py-3 text-sm">
            <span className="block">No cities match that search.</span>
            {/* Search is restricted to place-level results, so parks, deserts and
                landmarks never appear. Without this the empty state reads as a
                broken search rather than the wrong kind of query. */}
            <span className="mt-1 block text-xs">
              Parks and landmarks are not searchable. Try the nearest city or town, then drop a pin.
            </span>
          </li>
        ) : null}

        {results.map((city, index) => (
          <li
            key={`${city.providerPlaceId}-${index}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            // Keeps the input focused so the click does not blur-and-close first.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleSelect(city)}
            onMouseEnter={() => setActiveIndex(index)}
            className={cn(
              "min-h-12 cursor-pointer px-3 py-3 text-base",
              index === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground",
            )}
          >
            <span className="block truncate">{city.displayName}</span>
          </li>
        ))}
      </ul>

      {/* Announces progress to a screen reader without stealing focus. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {status === "loading" ? "Searching for cities" : null}
        {status === "ready"
          ? `${results.length} ${results.length === 1 ? "city" : "cities"} found`
          : null}
      </p>

      {/*
        The failure is announced from the visible message rather than repeated
        into the status region above -- duplicating it makes a screen reader
        read the same sentence twice.
      */}
      {status === "error" && errorMessage ? (
        <p role="alert" className="text-danger mt-1 text-sm">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export default CityAutocomplete;
