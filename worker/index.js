export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // --- CORS Headers ---
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- Authentication ---
    const authHeader = request.headers.get("Authorization");
    const isAuthorized = authHeader === `Bearer ${env.ADMIN_TOKEN}`;

    // --- API Routes ---

    // GET /api/verify - Check if token is valid
    if (url.pathname === "/api/verify" && method === "GET") {
      if (isAuthorized) {
        return new Response(JSON.stringify({ valid: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        return new Response(JSON.stringify({ valid: false }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/files - Get all resources
    if (url.pathname === "/api/files" && method === "GET") {
      const list = await env.LIBRARY_KV.list();
      const files = await Promise.all(
        list.keys.map(async (key) => {
          const val = await env.LIBRARY_KV.get(key.name);
          return JSON.parse(val);
        })
      );
      return new Response(JSON.stringify(files), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /api/upload - Upload file and metadata
    if (url.pathname === "/api/upload" && method === "POST") {
      if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const thumbnail = formData.get("thumbnail");
        const metadataRaw = formData.get("metadata");

        if (!file || !metadataRaw) {
          return new Response("Missing file or metadata", { status: 400, headers: corsHeaders });
        }

        const metadata = JSON.parse(metadataRaw);
        const id = crypto.randomUUID();
        const fileName = `${id}-${file.name.replaceAll(" ", "_")}`;

        // Upload main file to R2
        await env.LIBRARY_BUCKET.put(fileName, file);
        const file_url = `${env.R2_PUBLIC_DOMAIN}/${fileName}`;

        // Handle thumbnail
        let thumbnail_url = "";
        let thumbnail_key = "";

        if (thumbnail && thumbnail instanceof File && thumbnail.size > 0) {
          thumbnail_key = `thumb-${id}-${thumbnail.name.replaceAll(" ", "_")}`;
          await env.LIBRARY_BUCKET.put(thumbnail_key, thumbnail);
          thumbnail_url = `${env.R2_PUBLIC_DOMAIN}/${thumbnail_key}`;
        } else {
          // Default thumbnails based on instrument
          const defaults = {
            guitarra: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400",
            piano: "https://images.unsplash.com/photo-1520529688554-b0cbb358399e?w=400",
            bateria: "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=400",
            bajo: "https://images.unsplash.com/photo-1485278537138-4e8911a13c02?w=400",
            violin: "https://images.unsplash.com/photo-1465821508027-5815ad7258aa?w=400",
            cello: "https://images.unsplash.com/photo-1512733596533-7b00ccf8ebaf?w=400",
            teatro: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=400",
            artes_visuales: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=400",
            ligaditos: "https://images.unsplash.com/photo-1515037028865-0a2a82603f7c?w=400",
            canto: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400",
            teoria: "https://images.unsplash.com/photo-1507838596622-646657b733a4?w=400"
          };
          thumbnail_url = defaults[metadata.instrument] || "https://images.unsplash.com/photo-1514320298324-ee449035175e?w=400";
        }

        const finalMetadata = {
          ...metadata,
          id,
          file_url,
          thumbnail_url,
          size: formatBytes(file.size),
          date_uploaded: new Date().toISOString().split("T")[0],
          file_key: fileName,
          thumbnail_key: thumbnail_key
        };

        // Save to KV
        await env.LIBRARY_KV.put(id, JSON.stringify(finalMetadata));

        return new Response(JSON.stringify(finalMetadata), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    // DELETE /api/files/:id - Remove file
    if (url.pathname.startsWith("/api/files/") && method === "DELETE") {
      if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const id = url.pathname.split("/").pop();
      const metadataStr = await env.LIBRARY_KV.get(id);

      if (!metadataStr) {
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      const metadata = JSON.parse(metadataStr);

      // Delete from R2
      await env.LIBRARY_BUCKET.delete(metadata.file_key);
      if (metadata.thumbnail_key) {
        await env.LIBRARY_BUCKET.delete(metadata.thumbnail_key);
      }

      // Delete from KV
      await env.LIBRARY_KV.delete(id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PUT /api/files/:id - Update metadata only
    if (url.pathname.startsWith("/api/files/") && method === "PUT") {
      if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const id = url.pathname.split("/").pop();
      const existingVal = await env.LIBRARY_KV.get(id);
      if (!existingVal) return new Response("Not Found", { status: 404, headers: corsHeaders });

      try {
        const updates = await request.json();
        const existingMetadata = JSON.parse(existingVal);

        // Merge updates safely
        const updatedMetadata = {
          ...existingMetadata,
          ...updates,
          id: existingMetadata.id, // ID remains constant
          file_url: existingMetadata.file_url, // URL remains constant
          file_name: existingMetadata.file_name, // Key remains constant
          size: existingMetadata.size, // Size remains constant
          date_uploaded: existingMetadata.date_uploaded // Date remains constant
        };

        await env.LIBRARY_KV.put(id, JSON.stringify(updatedMetadata));

        return new Response(JSON.stringify(updatedMetadata), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
