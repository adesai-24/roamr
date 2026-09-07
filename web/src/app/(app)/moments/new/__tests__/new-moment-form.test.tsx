import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CityRow } from "@/lib/cities/types";
import {
  createMomentAction,
  createPhotoUploadTargetAction,
  suggestCityAction,
} from "@/lib/moments/actions";
import { preparePhoto } from "@/lib/moments/photo-pipeline";
import { uploadPhoto } from "@/lib/moments/upload";
import { NewMomentForm } from "../new-moment-form";

/** Factories rather than real modules. */
vi.mock("@/lib/moments/actions", () => ({
  createPhotoUploadTargetAction: vi.fn(),
  createMomentAction: vi.fn(),
  suggestCityAction: vi.fn(),
  updateMomentAction: vi.fn(),
  deleteMomentAction: vi.fn(),
}));
vi.mock("@/lib/moments/photo-pipeline", () => ({ preparePhoto: vi.fn() }));
vi.mock("@/lib/moments/upload", () => ({ uploadPhoto: vi.fn() }));
vi.mock("@/lib/cities/actions", () => ({
  searchCitiesAction: vi.fn(),
  resolveCityAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));

const TOKYO: CityRow = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  provider: "fake",
  provider_place_id: "place.9666437979919480",
  name: "Tokyo",
  admin1: "Tokyo",
  country_code: "JP",
  display_name: "Tokyo, Japan",
  lat: 35.6895,
  lng: 139.6917,
  created_at: "2026-01-01T00:00:00.000Z",
};

const UPLOAD_TARGET = {
  bucket: "moment-photos",
  path: "8f14e45f-ceea-467a-9d1b-4c1f2a3b4c5d/3fa85f64-5717-4562-b3fc-2c963f66afa6.jpg",
  token: "signed-upload-token",
};

const ENCODED_BLOB = new Blob(["encoded"], { type: "image/jpeg" });
const TAKEN_AT = new Date("2024-07-04T18:30:15.000Z");

function preparedPhoto(overrides: Partial<Awaited<ReturnType<typeof preparePhoto>>> = {}) {
  return {
    blob: ENCODED_BLOB,
    width: 2048,
    height: 1536,
    takenAt: TAKEN_AT,
    lat: 35.6895,
    lng: 139.6917,
    ...overrides,
  };
}

function pickPhoto() {
  const input = screen.getByLabelText("Photo");
  const file = new File(["original"], "IMG_4021.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();

  // jsdom has neither, and the preview needs both.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();

  vi.mocked(preparePhoto).mockResolvedValue(preparedPhoto());
  vi.mocked(suggestCityAction).mockResolvedValue({ ok: true, data: TOKYO });
  vi.mocked(createPhotoUploadTargetAction).mockResolvedValue({ ok: true, data: UPLOAD_TARGET });
  vi.mocked(createMomentAction).mockResolvedValue({
    ok: true,
    data: { momentId: "11111111-2222-3333-4444-555555555555", cityId: TOKYO.id },
  });
  vi.mocked(uploadPhoto).mockResolvedValue(undefined);
});

describe("NewMomentForm", () => {
  it("cannot be submitted before a photo and a city are chosen", () => {
    render(<NewMomentForm />);

    expect(screen.getByRole("button", { name: "Save moment" })).toBeDisabled();
  });

  it("prefills the city from the photo's own coordinates", async () => {
    render(<NewMomentForm />);
    pickPhoto();

    await waitFor(() => {
      expect(suggestCityAction).toHaveBeenCalledWith(35.6895, 139.6917);
    });
    expect(await screen.findByText("Tokyo, Japan")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save moment" })).toBeEnabled();
    });
  });

  it("hands the picked file to the pipeline, not the other way round", async () => {
    render(<NewMomentForm />);
    const file = pickPhoto();

    await waitFor(() => {
      expect(preparePhoto).toHaveBeenCalledWith(file);
    });
  });

  it("uploads the downscaled blob and saves the moment", async () => {
    render(<NewMomentForm />);
    pickPhoto();
    await screen.findByText("Tokyo, Japan");

    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "  Shibuya at closing time  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save moment" }));

    await waitFor(() => {
      expect(uploadPhoto).toHaveBeenCalledTimes(1);
    });
    // Identity.
    const [target, blob] = vi.mocked(uploadPhoto).mock.calls[0] ?? [];
    expect(target).toEqual(UPLOAD_TARGET);
    expect(blob).toBe(ENCODED_BLOB);

    expect(createMomentAction).toHaveBeenCalledWith({
      photoPath: UPLOAD_TARGET.path,
      width: 2048,
      height: 1536,
      caption: "Shibuya at closing time",
      takenAt: TAKEN_AT.toISOString(),
      // The pin stays optional.
      pinLat: null,
      pinLng: null,
      city: TOKYO.provider_place_id,
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/moments/11111111-2222-3333-4444-555555555555");
    });
  });

  it("does not upload before the server has issued a target", async () => {
    const order: string[] = [];
    vi.mocked(createPhotoUploadTargetAction).mockImplementation(async () => {
      order.push("target");
      return { ok: true, data: UPLOAD_TARGET };
    });
    vi.mocked(uploadPhoto).mockImplementation(async () => {
      order.push("upload");
    });

    render(<NewMomentForm />);
    pickPhoto();
    await screen.findByText("Tokyo, Japan");
    fireEvent.click(screen.getByRole("button", { name: "Save moment" }));

    await waitFor(() => expect(order).toEqual(["target", "upload"]));
  });

  it("leaves the city unset when the photo carries no location", async () => {
    vi.mocked(preparePhoto).mockResolvedValue(preparedPhoto({ lat: null, lng: null }));

    render(<NewMomentForm />);
    pickPhoto();

    await waitFor(() => {
      expect(screen.getByAltText("The photo you picked")).toBeInTheDocument();
    });
    expect(suggestCityAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save moment" })).toBeDisabled();
  });

  it("says so when a photo cannot be read, and keeps the form usable", async () => {
    vi.mocked(preparePhoto).mockRejectedValue(new Error("That file is not an image."));

    render(<NewMomentForm />);
    pickPhoto();

    expect(await screen.findByRole("alert")).toHaveTextContent("That file is not an image.");
    expect(createMomentAction).not.toHaveBeenCalled();
  });

  it("surfaces an upload failure instead of creating a moment with no photo", async () => {
    vi.mocked(uploadPhoto).mockRejectedValue(new Error("Could not upload that photo."));

    render(<NewMomentForm />);
    pickPhoto();
    await screen.findByText("Tokyo, Japan");
    fireEvent.click(screen.getByRole("button", { name: "Save moment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not upload that photo.");
    expect(createMomentAction).not.toHaveBeenCalled();
  });

  it("surfaces a rejected save without navigating away", async () => {
    vi.mocked(createMomentAction).mockResolvedValue({
      ok: false,
      error: "That caption is too long.",
    });

    render(<NewMomentForm />);
    pickPhoto();
    await screen.findByText("Tokyo, Japan");
    fireEvent.click(screen.getByRole("button", { name: "Save moment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That caption is too long.");
    expect(push).not.toHaveBeenCalled();
  });

  it("offers the pin only once there is somewhere to open the map", async () => {
    vi.mocked(preparePhoto).mockResolvedValue(preparedPhoto({ lat: null, lng: null }));

    render(<NewMomentForm />);
    expect(screen.getByRole("button", { name: "Add an exact pin" })).toBeDisabled();

    pickPhoto();
    await waitFor(() => {
      expect(screen.getByAltText("The photo you picked")).toBeInTheDocument();
    });
    // Still nothing to centre on: no photo GPS and no city yet.
    expect(screen.getByRole("button", { name: "Add an exact pin" })).toBeDisabled();
  });
});
