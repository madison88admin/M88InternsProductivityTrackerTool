import { supabase } from './supabase.js';

function normalizePath(path) {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^\/+/, '');
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

export function getAuthenticatedAssetUrl(bucket, path) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return null;
  if (isAbsoluteUrl(normalizedPath)) return normalizedPath;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;

  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = encodeURIComponent(normalizedPath);
  return `${supabaseUrl}/functions/v1/download-asset?bucket=${encodedBucket}&path=${encodedPath}`;
}

export async function fetchAuthenticatedAsset(bucket, path) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return null;
  if (isAbsoluteUrl(normalizedPath)) return normalizedPath;

  try {
    // Use Supabase's built-in signed URL - works with RLS policies
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(normalizedPath, 3600); // 1 hour expiry

    if (error) {
      console.error(`Failed to create signed URL: ${error.message}`);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error('Asset fetch error:', err);
    return null;
  }
}

export function getPublicStorageUrl(bucket, path) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return null;
  if (isAbsoluteUrl(normalizedPath)) return normalizedPath;

  try {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(normalizedPath);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

export async function getSignedStorageUrl(bucket, path, expiresIn = 3600) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return null;
  if (isAbsoluteUrl(normalizedPath)) return normalizedPath;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(normalizedPath, expiresIn);

    if (error) {
      return getPublicStorageUrl(bucket, path);
    }
    return data?.signedUrl || getPublicStorageUrl(bucket, path);
  } catch {
    return getPublicStorageUrl(bucket, path);
  }
}

export async function getSignedStorageUrls(bucket, paths, expiresIn = 3600) {
  const pathEntries = Array.from(new Set((paths || [])
    .map(normalizePath)
    .filter(Boolean)));

  const results = new Map();
  if (pathEntries.length === 0) return results;

  const absolutePaths = pathEntries.filter(isAbsoluteUrl);
  absolutePaths.forEach((p) => results.set(p, p));

  const storagePaths = pathEntries.filter((p) => !isAbsoluteUrl(p));
  if (storagePaths.length === 0) return results;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(storagePaths, expiresIn);

    if (error) {
      storagePaths.forEach((path) => {
        const publicUrl = getPublicStorageUrl(bucket, path);
        if (publicUrl) results.set(path, publicUrl);
      });
      return results;
    }

    (data || []).forEach((entry, idx) => {
      const sourcePath = entry?.path || storagePaths[idx];
      if (sourcePath && entry?.signedUrl) {
        results.set(sourcePath, entry.signedUrl);
      } else if (sourcePath) {
        const publicUrl = getPublicStorageUrl(bucket, sourcePath);
        if (publicUrl) results.set(sourcePath, publicUrl);
      }
    });
  } catch {
    storagePaths.forEach((path) => {
      const publicUrl = getPublicStorageUrl(bucket, path);
      if (publicUrl) results.set(path, publicUrl);
    });
  }

  return results;
}