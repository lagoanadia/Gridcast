import type { Video } from "./types";

/** Where a platform can download the file from: the cloud URL when there is one, else the local path (dry-run only). */
export const mediaUrlFor = (v: Video): string => v.mediaUrl ?? v.filePath ?? "";
