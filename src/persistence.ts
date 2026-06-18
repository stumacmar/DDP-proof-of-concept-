import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import type { Project } from './types';

const STORAGE_KEY = 'site-programme-viewer:project';
const MAPPING_KEY = 'site-programme-viewer:csv-mapping';
/** Custom Info-dictionary key used to embed the project JSON in the PDF. */
const PDF_META_KEY = 'SiteProgrammeViewerProject';
export const PROJECT_ATTACHMENT_NAME = 'project.json';

// ── localStorage autosave ─────────────────────────────────────────────────
export function saveToLocalStorage(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    /* quota / privacy mode — non-fatal */
  }
}

export function loadFromLocalStorage(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Project) : null;
  } catch {
    return null;
  }
}

export function saveCsvMapping(mapping: unknown): void {
  try {
    localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
  } catch {
    /* non-fatal */
  }
}

export function loadCsvMapping<T>(): T | null {
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ── plain JSON file import/export ──────────────────────────────────────────
export function downloadJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(blob, `${safeName(project.settings.siteName)}-project.json`);
}

export async function readProjectFromJsonFile(file: File): Promise<Project> {
  const text = await file.text();
  return JSON.parse(text) as Project;
}

// ── PDF embed / restore ────────────────────────────────────────────────────

/**
 * Embed the project JSON into a PDFDocument in TWO ways:
 *   1. As an attached file named "project.json" (portable to other tools).
 *   2. As a base64 value in a custom Info-dictionary key (robust restore).
 * Base64 avoids PDF string-escaping issues with raw JSON.
 */
export async function embedProjectInPdf(
  pdf: PDFDocument,
  project: Project,
): Promise<void> {
  const json = JSON.stringify(project);
  const bytes = new TextEncoder().encode(json);

  // (1) Attached file.
  await pdf.attach(bytes, PROJECT_ATTACHMENT_NAME, {
    mimeType: 'application/json',
    description: 'Site Programme Viewer project data',
  });

  // (2) Custom Info-dictionary metadata (base64).
  pdf.setTitle(project.settings.siteName || 'Site Programme');
  const infoRef = pdf.context.trailerInfo.Info;
  const info = pdf.context.lookup(infoRef, PDFDict);
  if (info) {
    info.set(PDFName.of(PDF_META_KEY), PDFString.of(base64Encode(bytes)));
  }
}

/**
 * Read an app-exported project back out of a PDF file.
 * Tries the embedded attachment first, then the Info-dictionary metadata.
 * Throws if neither is present (i.e. not a PDF exported by this app).
 */
export async function readProjectFromPdf(file: File): Promise<Project> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return readProjectFromPdfBytes(buf);
}

/** Restore a project from raw PDF bytes (testable without a File/DOM). */
export async function readProjectFromPdfBytes(buf: Uint8Array): Promise<Project> {
  const pdf = await PDFDocument.load(buf, { updateMetadata: false });

  const fromAttachment = extractAttachmentJson(pdf);
  if (fromAttachment) return JSON.parse(fromAttachment) as Project;

  const fromMeta = extractMetaJson(pdf);
  if (fromMeta) return JSON.parse(fromMeta) as Project;

  throw new Error(
    'This PDF has no project data — open one exported by this app.',
  );
}

function extractMetaJson(pdf: PDFDocument): string | null {
  try {
    const infoRef = pdf.context.trailerInfo.Info;
    const info = pdf.context.lookup(infoRef, PDFDict);
    const val = info?.get(PDFName.of(PDF_META_KEY));
    if (val instanceof PDFString) {
      return base64Decode(val.asString());
    }
  } catch {
    /* fall through */
  }
  return null;
}

function extractAttachmentJson(pdf: PDFDocument): string | null {
  try {
    const namesDict = pdf.catalog.lookup(PDFName.of('Names'), PDFDict);
    if (!namesDict) return null;
    const efDict = namesDict.lookup(PDFName.of('EmbeddedFiles'), PDFDict);
    if (!efDict) return null;
    const namesArr = efDict.lookup(PDFName.of('Names'), PDFArray);
    if (!namesArr) return null;

    for (let i = 0; i < namesArr.size(); i += 2) {
      const nameVal = namesArr.get(i);
      const name = nameVal instanceof PDFString ? nameVal.asString() : '';
      const fileSpec = namesArr.lookup(i + 1, PDFDict);
      if (!fileSpec) continue;
      const ef = fileSpec.lookup(PDFName.of('EF'), PDFDict);
      if (!ef) continue;
      const stream = ef.lookup(PDFName.of('F'));
      if (stream instanceof PDFRawStream) {
        const bytes = decodePDFRawStream(stream).decode();
        const text = new TextDecoder().decode(bytes);
        if (name === PROJECT_ATTACHMENT_NAME || looksLikeProject(text)) {
          return text;
        }
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

function looksLikeProject(text: string): boolean {
  return text.includes('"plots"') && text.includes('"phases"');
}

// ── helpers ────────────────────────────────────────────────────────────────
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(s: string): string {
  return (s || 'site').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'site';
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
