#!/usr/bin/env node
/**
 * Creates a dedicated test user for automated quality sweep runs.
 * Uses Supabase admin API to bypass email verification.
 * Sets up user + company + spokesperson just like the auth/callback flow does.
 *
 * Idempotent: if the test user already exists, does nothing.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import crypto from "node:crypto";

config({ path: ".env.local" });

const TEST_EMAIL = "quality-sweep@agencybristol.com";
const TEST_PASSWORD = process.env.TEST_PASSWORD || crypto.randomBytes(16).toString("base64url");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Check if user already exists
const { data: users } = await supabase.auth.admin.listUsers();
const existing = users?.users?.find((u) => u.email === TEST_EMAIL);

if (existing) {
  console.log(`Test user already exists: ${TEST_EMAIL} (id: ${existing.id})`);
  console.log(`If you've lost the password, delete the user and re-run this script.`);
  console.log("");
  console.log(`Add to .env.local (use your existing password):`);
  console.log(`TEST_EMAIL=${TEST_EMAIL}`);
  console.log(`TEST_PASSWORD=<your existing password>`);
  process.exit(0);
}

// Create auth user with confirmed email (admin API bypasses verification)
const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
  user_metadata: {
    full_name: "Quality Sweep Test User",
    company_name: "Quality Sweep Test Co",
    industry: "Healthcare",
  },
});

if (authErr || !authData.user) {
  console.error("Failed to create auth user:", authErr);
  process.exit(1);
}

const userId = authData.user.id;
console.log(`Created auth user: ${TEST_EMAIL} (id: ${userId})`);

// Provision company (mirror of auth/callback logic)
const companyName = "Quality Sweep Test Co";
const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
const trialExpiresAt = new Date();
trialExpiresAt.setDate(trialExpiresAt.getDate() + 365); // Long trial for test account

const { data: newCompany, error: companyErr } = await supabase
  .from("companies")
  .insert({
    name: companyName,
    slug,
    plan: "agency",
    trial_plan: "agency",
    trial_started_at: new Date().toISOString(),
    trial_expires_at: trialExpiresAt.toISOString(),
    spokesperson_name: "Quality Sweep Test User",
    industry: "Healthcare",
  })
  .select("id")
  .single();

if (companyErr || !newCompany) {
  console.error("Failed to create company:", companyErr);
  process.exit(1);
}

console.log(`Created company: ${companyName} (id: ${newCompany.id})`);

// Create user profile linked to company — as admin so we can reach all pages
await supabase.from("users").insert({
  id: userId,
  email: TEST_EMAIL,
  full_name: "Quality Sweep Test User",
  role: "admin",
  company_id: newCompany.id,
});

// Create primary spokesperson
await supabase.from("company_spokespersons").insert({
  company_id: newCompany.id,
  name: "Quality Sweep Test User",
  is_primary: true,
  is_active: true,
  sort_order: 0,
});

console.log("");
console.log("=== Test user ready ===");
console.log(`TEST_EMAIL=${TEST_EMAIL}`);
console.log(`TEST_PASSWORD=${TEST_PASSWORD}`);
console.log("");
console.log("Add these to .env.local (already done automatically if you used --append).");
