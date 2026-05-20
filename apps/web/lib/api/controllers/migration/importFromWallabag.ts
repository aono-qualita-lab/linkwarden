import { prisma } from "@linkwarden/prisma";
import { createFolder } from "@linkwarden/filesystem";
import { hasPassedLimit } from "@linkwarden/lib/verifyCapacity";

type WallabagBackup = {
  is_archived: number;
  is_starred: number;
  tags: String[];
  is_public: boolean;
  id: number;
  title: string;
  url: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  published_by: string[];
  starred_at: Date;
  annotations: any[];
  mimetype: string;
  language: string;
  reading_time: number;
  domain_name: string;
  preview_picture: string;
  http_status: string;
  headers: Record<string, string>;
}[];

function extractItems(parsed: unknown): Record<string, unknown>[] {
  // 1) Already an array
  if (Array.isArray(parsed)) {
    return parsed as Record<string, unknown>[];
  }

  if (parsed === null || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;

  // 2) HAL-JSON: { _embedded: { items: [...] } }
  const embedded = obj._embedded;
  if (embedded && typeof embedded === "object") {
    const emb = embedded as Record<string, unknown>;
    for (const key of ["items", "entries", "entry", "links"]) {
      if (Array.isArray(emb[key])) {
        return emb[key] as Record<string, unknown>[];
      }
    }
  }

  // 3) Top-level known keys
  for (const key of ["items", "entries", "entry", "links", "data", "records", "results"]) {
    if (Array.isArray(obj[key])) {
      return obj[key] as Record<string, unknown>[];
    }
  }

  // 4) Single entry object
  if (typeof obj.id !== "undefined") {
    return [obj];
  }

  // 5) Fallback: find any array where items have "id" or "url"
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && value.length > 0) {
      if (typeof value[0] === "object" && value[0] !== null) {
        const first = value[0] as Record<string, unknown>;
        if (typeof first.id !== "undefined" || typeof first.url !== "undefined") {
          return value as Record<string, unknown>[];
        }
      }
    }
  }

  return [];
}

export default async function importFromWallabag(
  userId: number,
  rawData: string
) {
  const parsed: unknown = JSON.parse(rawData);

  const data = extractItems(parsed) as WallabagBackup;

  // Filter out entries without a valid URL
  const backup = data.filter(
    (e) => e.url && e.url.trim().length > 0
  );

  let totalImports = backup.length;

  const hasTooManyLinks = await hasPassedLimit(userId, totalImports);

  if (hasTooManyLinks) {
    return {
      response: `Your subscription has reached the maximum number of links allowed.`,
      status: 400,
    };
  }

  // Normalize and validate URLs
  const validLinks = backup.filter((link) => {
    let urlStr = link.url?.trim();
    if (!urlStr) return false;
    // Prepend https:// if no protocol is present
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(urlStr)) {
      urlStr = "https://" + urlStr;
    }
    try {
      new URL(urlStr);
      return true;
    } catch {
      return false;
    }
  });

  if (validLinks.length === 0) {
    return {
      response: "No valid URLs found in the import file.",
      status: 400,
    };
  }

  let importCount = 0;

  await prisma
    .$transaction(
      async (tx) => {
        const newCollection = await tx.collection.create({
          data: {
            owner: {
              connect: {
                id: userId,
              },
            },
            name: "Imports",
            createdBy: {
              connect: {
                id: userId,
              },
            },
          },
        });

        createFolder({ filePath: `archives/${newCollection.id}` });

        for (const link of validLinks) {
          await tx.link.create({
            data: {
              pinnedBy: link.is_starred
                ? { connect: { id: userId } }
                : undefined,
              url: link.url?.trim().slice(0, 2047),
              name: link.title?.trim().slice(0, 254) || "",
              textContent: link.content?.trim().slice(0, 2047) || "",
              importDate: link.created_at || null,
              collection: {
                connect: {
                  id: newCollection.id,
                },
              },
              createdBy: {
                connect: {
                  id: userId,
                },
              },
              tags:
                link.tags && link.tags[0]
                  ? {
                    connectOrCreate: link.tags.map((tag) => ({
                      where: {
                        name_ownerId: {
                          name: tag?.trim().slice(0, 49),
                          ownerId: userId,
                        },
                      },
                      create: {
                        name: tag?.trim().slice(0, 49),
                        owner: {
                          connect: {
                            id: userId,
                          },
                        },
                      },
                    })),
                  }
                  : undefined,
            },
          });

          importCount++;
        }
      },
      { timeout: 30000 }
    );

  return {
    response: `Successfully imported ${importCount} links.`,
    status: 200,
  };
}
