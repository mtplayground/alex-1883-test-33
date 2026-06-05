import { ApiError } from "../../../scripts/error-response.mjs";

export const MAX_POST_CAPTION_LENGTH = 1000;

export function createPostsService({ repository }) {
  if (!repository) {
    throw new Error("posts repository is required");
  }

  return {
    async createPost({ authorId, imageUrl, caption = "" }) {
      assertId(authorId, "authorId");
      const normalizedImageUrl = normalizeImageUrl(imageUrl);
      const normalizedCaption = normalizeCaption(caption);
      return repository.create({
        authorId,
        imageUrl: normalizedImageUrl,
        caption: normalizedCaption,
      });
    },
  };
}

export function createPostgresPostsRepository(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("PostgreSQL query client is required");
  }

  return {
    async create({ authorId, imageUrl, caption }) {
      const result = await db.query(
        `
          WITH inserted AS (
            INSERT INTO posts (author_id, image_url, caption)
            SELECT u.id, $2, $3
            FROM users u
            WHERE u.id = $1
            RETURNING id, author_id, image_url, caption, created_at, updated_at
          )
          SELECT
            inserted.id,
            inserted.author_id,
            inserted.image_url,
            inserted.caption,
            inserted.created_at,
            inserted.updated_at,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url
          FROM inserted
          JOIN users u ON u.id = inserted.author_id
        `,
        [authorId, imageUrl, caption],
      );

      const row = result.rows[0];
      if (!row) {
        throw new ApiError(404, "NOT_FOUND", "Author not found");
      }
      return mapPostRow(row);
    },
  };
}

function normalizeImageUrl(imageUrl) {
  const normalized = String(imageUrl ?? "").trim();
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", "Post imageUrl is required", { field: "imageUrl" });
  }
  return normalized;
}

function normalizeCaption(caption) {
  const normalized = String(caption ?? "").trim();
  if (normalized.length > MAX_POST_CAPTION_LENGTH) {
    throw new ApiError(400, "VALIDATION_ERROR", "Post caption is too long", {
      field: "caption",
      maxLength: MAX_POST_CAPTION_LENGTH,
    });
  }
  return normalized;
}

function assertId(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  }
}

function mapPostRow(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    caption: row.caption || "",
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    author: {
      id: row.author_id,
      name: row.author_name || "Unknown user",
      avatarUrl: row.author_avatar_url || "",
    },
  };
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}
