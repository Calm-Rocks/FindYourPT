import { supabase } from './supabaseClient';

// ---------------------------------------------------------------
// Specialisms (static lookup list)
// ---------------------------------------------------------------
export async function fetchSpecialisms() {
  const { data, error } = await supabase
    .from('specialisms')
    .select('id, slug, label')
    .order('id');
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------
// Search
// ---------------------------------------------------------------
// specialismIds: array of smallint ids, or empty array / null for "no filter"
export async function searchPts({ lat, lon, specialismIds, ignoreRadius = false }) {
  const { data, error } = await supabase.rpc('search_pts', {
    client_lat: lat,
    client_lon: lon,
    specialism_filter: specialismIds && specialismIds.length > 0 ? specialismIds : null,
    ignore_radius: ignoreRadius,
  });
  if (error) throw error;

  // The RPC doesn't return each PT's specialism tags (it returns the core
  // matched columns only) — fetch tags for the matched PTs in one extra
  // query rather than n+1 queries per card.
  if (!data || data.length === 0) return [];

  const ptIds = data.map((pt) => pt.id);
  const { data: tagRows, error: tagError } = await supabase
    .from('pt_specialisms')
    .select('pt_id, specialisms(id, slug, label)')
    .in('pt_id', ptIds);
  if (tagError) throw tagError;

  const tagsByPtId = {};
  for (const row of tagRows) {
    if (!tagsByPtId[row.pt_id]) tagsByPtId[row.pt_id] = [];
    tagsByPtId[row.pt_id].push(row.specialisms);
  }

  return data.map((pt) => ({
    ...pt,
    specialisms: tagsByPtId[pt.id] || [],
  }));
}

// ---------------------------------------------------------------
// Gyms
// ---------------------------------------------------------------
export async function fetchCuratedGyms() {
  const { data, error } = await supabase
    .from('gyms')
    .select('id, name, postcode')
    .eq('is_curated', true)
    .order('name');
  if (error) throw error;
  return data;
}

// Adds a one-off gym a PT typed in themselves (not in the curated list).
// Returns the new gym's id so the caller can link the PT to it immediately.
export async function createCustomGym({ name, postcode, lat, lon, userId }) {
  const { data, error } = await supabase
    .from('gyms')
    .insert({ name, postcode, lat, lon, is_curated: false, created_by: userId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// ---------------------------------------------------------------
// PT profile (the logged-in trainer's own listing)
// ---------------------------------------------------------------
export async function fetchOwnPtProfile(userId) {
  const { data, error } = await supabase
    .from('pts')
    .select('*, pt_specialisms(specialism_id), gyms(id, name, postcode)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------
// Public PT profile (for the dedicated profile page, reached by
// clicking a search result card)
// ---------------------------------------------------------------
export async function fetchPublicPtProfile(ptId) {
  const { data, error } = await supabase
    .from('pts')
    .select('*, pt_specialisms(specialisms(id, slug, label)), gyms(id, name, postcode)')
    .eq('id', ptId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertPtProfile({
  userId,
  displayName,
  bio,
  postcode,
  lat,
  lon,
  radiusMiles,
  rateGbp,
  listingTier,
  specialismIds,
  gymId,
  websiteUrl,
  instagramUrl,
  facebookUrl,
}) {
  const { error: upsertError } = await supabase.from('pts').upsert({
    id: userId,
    display_name: displayName,
    bio,
    postcode,
    lat,
    lon,
    radius_miles: radiusMiles,
    rate_gbp: rateGbp,
    listing_tier: listingTier,
    is_active: true,
    gym_id: gymId || null,
    website_url: websiteUrl || null,
    instagram_url: instagramUrl || null,
    facebook_url: facebookUrl || null,
  });
  if (upsertError) throw upsertError;

  // Replace specialism links wholesale — simplest correct approach for a
  // small list like this (max ~9 rows), avoids diffing add/remove sets.
  const { error: deleteError } = await supabase
    .from('pt_specialisms')
    .delete()
    .eq('pt_id', userId);
  if (deleteError) throw deleteError;

  if (specialismIds.length > 0) {
    const { error: insertError } = await supabase
      .from('pt_specialisms')
      .insert(specialismIds.map((id) => ({ pt_id: userId, specialism_id: id })));
    if (insertError) throw insertError;
  }
}

export async function setListingActive(userId, isActive) {
  const { error } = await supabase
    .from('pts')
    .update({ is_active: isActive })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateProfilePhotoUrl(userId, url) {
  const { error } = await supabase.from('pts').update({ profile_photo_url: url }).eq('id', userId);
  if (error) throw error;
}

export async function addGalleryImageUrl(userId, url, currentUrls) {
  const { error } = await supabase
    .from('pts')
    .update({ gallery_urls: [...currentUrls, url] })
    .eq('id', userId);
  if (error) throw error;
}

export async function removeGalleryImageUrl(userId, url, currentUrls) {
  const { error } = await supabase
    .from('pts')
    .update({ gallery_urls: currentUrls.filter((u) => u !== url) })
    .eq('id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------
export async function submitEnquiry({ ptId, clientName, clientContact, message, clientPostcode }) {
  const { error } = await supabase.from('enquiries').insert({
    pt_id: ptId,
    client_name: clientName,
    client_contact: clientContact,
    message: message || '',
    client_postcode: clientPostcode || null,
  });
  if (error) throw error;
}

export async function fetchOwnEnquiries(userId) {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('pt_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
