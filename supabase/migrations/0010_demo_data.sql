-- ============================================================
-- SpotMyPT — migration 0010: demo data for PT sales demo
-- Run this in the Supabase SQL editor AFTER 0009.
--
-- Adds: 5 real Leicester gym branches (PureGym + The Gym Group, genuine
-- postcodes) and 10 demo trainer listings spread across Leicester and
-- the surrounding area — varied specialisms, price points, gym-based and
-- mobile/travel-radius trainers, a mix of standard and featured tiers,
-- ALL pre-approved (verification_status = 'approved', is_active = true)
-- so every listing is immediately visible in search for demo purposes.
--
-- IMPORTANT: this is demo/seed data, not real trainers. Before going live
-- with real PTs, remove these rows — see supabase/pre_launch_cleanup.sql
-- for a safe, manual (not blind-delete) process. A clean marker is
-- included below (every demo auth.users row uses the email domain
-- @demo.spotmypt.internal) specifically so they're easy to find and
-- remove later without guessing.
-- ============================================================

-- ------------------------------------------------------------
-- Real Leicester gym branches (verified postcodes via web search at
-- time of writing — PureGym and The Gym Group both have genuine
-- Leicester locations at these addresses).
-- ------------------------------------------------------------
insert into gyms (name, postcode, lat, lon, is_curated) values
  ('PureGym Leicester St Georges Way', 'LE1 1SH', 52.6356, -1.1335, true),
  ('PureGym Leicester Walnut Street',  'LE2 7GR', 52.6225, -1.1308, true),
  ('PureGym Leicester Thurmaston',     'LE4 8GP', 52.6685, -1.1102, true),
  ('The Gym Group Leicester Highcross', 'LE1 4FQ', 52.6369, -1.1398, true),
  ('The Gym Group Leicester Aylestone Road', 'LE2 7QH', 52.6209, -1.1422, true)
on conflict do nothing;

-- ------------------------------------------------------------
-- Demo trainer accounts (auth.users rows). These are seed accounts, not
-- real sign-ups — direct insert into auth.users is the only way to
-- satisfy the pts.id foreign key without going through the real signup
-- API, which is the standard approach for seed data of this kind.
-- Marked with @demo.spotmypt.internal so they're trivially identifiable
-- and excludable later.
-- ------------------------------------------------------------
insert into auth.users (id, email) values
  ('e0000001-0000-0000-0000-000000000001', 'jess.okafor@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000002', 'marcus.webb@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000003', 'aiyana.patel@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000004', 'tom.ridley@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000005', 'freya.lindqvist@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000006', 'connor.hayes@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000007', 'olivia.marsh@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000008', 'dan.whitfield@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000009', 'priya.anand@demo.spotmypt.internal'),
  ('e0000001-0000-0000-0000-000000000010', 'sam.okonkwo@demo.spotmypt.internal')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Demo trainer listings — varied specialisms, gym vs travel-radius,
-- price points (£28-£60/session), and tier (3 featured, 7 standard).
-- All approved + active so they're immediately visible in search.
-- ------------------------------------------------------------
insert into pts (id, display_name, bio, postcode, lat, lon, radius_miles, rate_gbp, listing_tier, verification_status, is_active, gym_id) values
  -- Featured, gym-based, central Leicester
  ('e0000001-0000-0000-0000-000000000001', 'Jess Okafor', 'Ex-competitive powerlifter, 6 years coaching. I build training around progressive overload that actually fits your week.', 'LE1 1SH', 52.6356, -1.1335, 8, 45, 'featured', 'approved', true,
    (select id from gyms where name = 'PureGym Leicester St Georges Way')),

  -- Standard, travel-radius only (mobile PT)
  ('e0000001-0000-0000-0000-000000000002', 'Marcus Webb', 'I help people build sustainable habits, not crash diets. Sessions combine training with realistic nutrition coaching.', 'LE3 0QQ', 52.6280, -1.1620, 10, 35, 'standard', 'approved', true, null),

  -- Featured, gym-based, Highcross
  ('e0000001-0000-0000-0000-000000000003', 'Aiyana Patel', 'Former gymnast, now coaching handstands, rings, and mobility work for adults who want to move better.', 'LE1 4FQ', 52.6369, -1.1398, 6, 50, 'featured', 'approved', true,
    (select id from gyms where name = 'The Gym Group Leicester Highcross')),

  -- Standard, gym-based, Walnut Street
  ('e0000001-0000-0000-0000-000000000004', 'Tom Ridley', 'Bodybuilding background with a focus on technique-first hypertrophy programming for intermediate lifters.', 'LE2 7GR', 52.6225, -1.1308, 6, 38, 'standard', 'approved', true,
    (select id from gyms where name = 'PureGym Leicester Walnut Street')),

  -- Standard, travel-radius, pre/post-natal specialist
  ('e0000001-0000-0000-0000-000000000005', 'Freya Lindqvist', 'Specialist pre/post-natal and 50+ training. Patient, methodical, and big on building confidence in the gym.', 'LE5 4PA', 52.6453, -1.0950, 12, 42, 'standard', 'approved', true, null),

  -- Standard, travel-radius, sports performance
  ('e0000001-0000-0000-0000-000000000006', 'Connor Hayes', 'Working with club-level athletes and strength sport competitors on periodised programming.', 'LE2 2BD', 52.6058, -1.1280, 15, 48, 'standard', 'approved', true, null),

  -- Standard, gym-based, Aylestone Road, rehab focus
  ('e0000001-0000-0000-0000-000000000007', 'Olivia Marsh', 'Physio-adjacent training focused on pain-free movement and building back confidence after injury.', 'LE2 7QH', 52.6209, -1.1422, 5, 40, 'standard', 'approved', true,
    (select id from gyms where name = 'The Gym Group Leicester Aylestone Road')),

  -- Featured, gym-based, Thurmaston, budget-friendly
  ('e0000001-0000-0000-0000-000000000008', 'Dan Whitfield', 'Leicester-based, in-person and online. Straightforward hypertrophy and fat-loss programming, no fluff.', 'LE4 8GP', 52.6685, -1.1102, 10, 28, 'featured', 'approved', true,
    (select id from gyms where name = 'PureGym Leicester Thurmaston')),

  -- Standard, travel-radius, gymnastics/calisthenics
  ('e0000001-0000-0000-0000-000000000009', 'Priya Anand', 'Calisthenics and gymnastics-strength coach. Skill work meets structured progressions for adults.', 'LE1 6RU', 52.6395, -1.1290, 8, 47, 'standard', 'approved', true, null),

  -- Standard, gym-based, premium rate, strength & powerlifting
  ('e0000001-0000-0000-0000-000000000010', 'Sam Okonkwo', 'GB powerlifting squad coach, now taking on a small number of 1:1 strength clients in Leicester.', 'LE1 1SH', 52.6356, -1.1335, 8, 60, 'standard', 'approved', true,
    (select id from gyms where name = 'PureGym Leicester St Georges Way'))
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Specialisms per trainer — at least one each, several with 2-3 for
-- realistic variety in how cards display (tag counts, "+N" overflow).
-- ------------------------------------------------------------
insert into pt_specialisms (pt_id, specialism_id) values
  ('e0000001-0000-0000-0000-000000000001', 1), -- Jess: Hypertrophy
  ('e0000001-0000-0000-0000-000000000001', 3), -- Jess: Strength & powerlifting

  ('e0000001-0000-0000-0000-000000000002', 2), -- Marcus: Weight loss
  ('e0000001-0000-0000-0000-000000000002', 9), -- Marcus: Nutrition coaching

  ('e0000001-0000-0000-0000-000000000003', 4), -- Aiyana: Gymnastics strength
  ('e0000001-0000-0000-0000-000000000003', 7), -- Aiyana: Mobility & rehab

  ('e0000001-0000-0000-0000-000000000004', 1), -- Tom: Hypertrophy
  ('e0000001-0000-0000-0000-000000000004', 6), -- Tom: Sports performance

  ('e0000001-0000-0000-0000-000000000005', 5), -- Freya: Pre/post-natal
  ('e0000001-0000-0000-0000-000000000005', 2), -- Freya: Weight loss
  ('e0000001-0000-0000-0000-000000000005', 8), -- Freya: Older adults

  ('e0000001-0000-0000-0000-000000000006', 3), -- Connor: Strength & powerlifting
  ('e0000001-0000-0000-0000-000000000006', 6), -- Connor: Sports performance

  ('e0000001-0000-0000-0000-000000000007', 7), -- Olivia: Mobility & rehab
  ('e0000001-0000-0000-0000-000000000007', 8), -- Olivia: Older adults

  ('e0000001-0000-0000-0000-000000000008', 1), -- Dan: Hypertrophy
  ('e0000001-0000-0000-0000-000000000008', 2), -- Dan: Weight loss

  ('e0000001-0000-0000-0000-000000000009', 4), -- Priya: Gymnastics strength
  ('e0000001-0000-0000-0000-000000000009', 7), -- Priya: Mobility & rehab

  ('e0000001-0000-0000-0000-000000000010', 3) -- Sam: Strength & powerlifting
on conflict (pt_id, specialism_id) do nothing;
