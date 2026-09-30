import { z } from "zod";
import { CARD_NAMES } from "../src/render/card-names.ts";

const StatusSchema = z.object({
  source: z.enum(["cache", "fixture"]),
  fetchedAt: z.iso.datetime(),
  files: z.array(z.string()),
});

const ErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

type Status = z.infer<typeof StatusSchema>;

const SOURCE_LABELS: Record<Status["source"], string> = {
  cache: "live cache",
  fixture: "fixture",
};

function requireElement<T extends HTMLElement>(
  id: string,
  type: new () => T,
): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Missing element #${id}`);
  }
  return element;
}

const statusElement = requireElement("status", HTMLSpanElement);
const errorElement = requireElement("error", HTMLSpanElement);
const sectionsElement = requireElement("sections", HTMLElement);
const refreshButton = requireElement("refresh", HTMLButtonElement);
const replayButton = requireElement("replay", HTMLButtonElement);

function themeKeyOf(file: string): string {
  const base = file.replace(/\.svg$/, "");
  const card = [...CARD_NAMES]
    .sort((a, b) => b.length - a.length)
    .find((name) => base.startsWith(`${name}-`));
  if (card !== undefined) {
    return base.slice(card.length + 1);
  }
  return base.slice(base.lastIndexOf("-") + 1);
}

function groupByTheme(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const key = themeKeyOf(file);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  return groups;
}

function cardUrl(file: string, version: number): string {
  return `/cards/${encodeURIComponent(file)}?v=${version}`;
}

function renderSections(files: string[]): void {
  const version = Date.now();
  const sections = [...groupByTheme(files)].map(([themeKey, themeFiles]) => {
    const section = document.createElement("section");
    section.className = themeKey.includes("light")
      ? "theme-light"
      : "theme-dark";
    section.setAttribute("aria-label", `Theme ${themeKey}`);

    const container = document.createElement("div");
    container.className = "cards";
    for (const file of themeFiles) {
      const link = document.createElement("a");
      link.href = `/cards/${encodeURIComponent(file)}`;
      link.target = "_blank";
      link.rel = "noopener";

      const image = document.createElement("img");
      image.height = 200;
      image.alt = file;
      image.dataset.file = file;
      image.src = cardUrl(file, version);

      link.append(image);
      container.append(link);
    }
    section.append(container);
    return section;
  });
  sectionsElement.replaceChildren(...sections);
}

function replayImages(): void {
  const version = Date.now();
  for (const image of sectionsElement.querySelectorAll("img")) {
    const file = image.dataset.file;
    if (file !== undefined) {
      image.src = cardUrl(file, version);
    }
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = ErrorBodySchema.safeParse(
    await response.json().catch(() => null),
  );
  return body.success
    ? `${body.data.error.code}: ${body.data.error.message}`
    : `Request failed with status ${response.status}`;
}

async function loadStatus(): Promise<void> {
  const response = await fetch("/api/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const status = StatusSchema.parse(await response.json());
  statusElement.textContent = `Data from ${SOURCE_LABELS[status.source]}, fetched ${new Date(status.fetchedAt).toLocaleString()}`;
  renderSections(status.files);
}

function showError(error: unknown): void {
  errorElement.textContent =
    error instanceof Error ? error.message : String(error);
}

async function refreshData(): Promise<void> {
  refreshButton.disabled = true;
  errorElement.textContent = "";
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) {
      showError(new Error(await readErrorMessage(response)));
    }
    await loadStatus();
  } catch (error) {
    showError(error);
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", () => {
  void refreshData();
});
replayButton.addEventListener("click", replayImages);

loadStatus().catch(showError);
