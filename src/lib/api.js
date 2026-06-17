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
export async function searchPts({ lat, lon, specialismIds }) {
  const { data, error } = await supabase.rpc('search_pts', {
    client_lat: lat,
    client_lon: lon,
    specialism_filter: specialismIds && specialismIds.length > 0 ? specialismIds : null,
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
// PT profile (the logged-in trainer's own listing)
// ---------------------------------------------------------------
export async function fetchOwnPtProfile(userId) {
  const { data, error } = await supabase
    .from('pts')
    .select('*, pt_specialisms(specialism_id)')
    .eq('id', userId)
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
