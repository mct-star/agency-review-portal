#!/usr/bin/env node
/**
 * Seed script for AGENCY Bristol
 *
 * Prerequisites: migration 003 must be run in Supabase SQL Editor first.
 *
 * Usage:
 *   node scripts/seed-agency-bristol.mjs                       # seed everything except API key
 *   node scripts/seed-agency-bristol.mjs --anthropic-key sk-... # also configure Anthropic
 *
 * What it does:
 *   1. Finds the AGENCY Bristol company (from seed data)
 *   2. Uploads the Company Blueprint as active version
 *   3. Creates weeks 12-14 (current/upcoming)
 *   4. Imports 157 topics from the topic bank
 *   5. Configures the Anthropic API key (if provided)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── Load env ────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(projectRoot, ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  const vars = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionKey = env.ENCRYPTION_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// ── Encryption (matches src/lib/crypto.ts — AES-256-GCM) ────

function encryptJson(data) {
  const key = Buffer.from(encryptionKey, "hex");
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

// ── Parse CLI args ──────────────────────────────────────────

const args = process.argv.slice(2);
let anthropicKey = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--anthropic-key" && args[i + 1]) {
    anthropicKey = args[i + 1];
    i++;
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("\n=== AGENCY Bristol Seeding Script ===\n");

  // 1. Find the company
  console.log("1. Finding AGENCY Bristol company...");
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", "agency-bristol");

  if (!companies || companies.length === 0) {
    console.error("   AGENCY Bristol company not found in database.");
    console.error("   Run migration 001 first (it seeds the companies table).");
    process.exit(1);
  }

  const company = companies[0];
  console.log(`   Found: ${company.name} (${company.id})`);

  // 2. Upload Blueprint
  console.log("\n2. Uploading Company Blueprint...");
  const blueprintPath = resolve(
    "/Users/michaelcolling-tuck/Library/CloudStorage/GoogleDrive-mct@agencybristol.com/Shared drives",
    "Agency Internal/AGENCY INTERNAL | Marketing/AGENCY | Content Workflow Templates/COMPANY_BLUEPRINT_AGENCY_BRISTOL.md"
  );

  let blueprintContent;
  try {
    blueprintContent = readFileSync(blueprintPath, "utf-8");
  } catch {
    console.error(`   Could not read blueprint at: ${blueprintPath}`);
    console.error("   Skipping blueprint upload.");
    blueprintContent = null;
  }

  if (blueprintContent) {
    // Deactivate existing blueprints
    await supabase
      .from("company_blueprints")
      .update({ is_active: false })
      .eq("company_id", company.id);

    const { data: bp, error: bpErr } = await supabase
      .from("company_blueprints")
      .insert({
        company_id: company.id,
        version: "5.0",
        blueprint_content: blueprintContent,
        is_active: true,
      })
      .select()
      .single();

    if (bpErr) {
      console.error(`   Blueprint upload failed: ${bpErr.message}`);
    } else {
      console.log(`   Blueprint uploaded (${blueprintContent.length} chars, v5.0, id: ${bp.id})`);
    }
  }

  // 3. Create weeks
  console.log("\n3. Creating weeks...");
  const weeksToCreate = [
    {
      week_number: 12,
      year: 2026,
      date_start: "2026-03-16",
      date_end: "2026-03-22",
      title: "March Week 3",
      pillar: "P3",
      theme: "The Fourth Lever",
      status: "draft",
    },
    {
      week_number: 13,
      year: 2026,
      date_start: "2026-03-23",
      date_end: "2026-03-29",
      title: "Q1 Wrap-Up",
      pillar: "OA",
      theme: "The Fourth Lever",
      status: "draft",
    },
    {
      week_number: 14,
      year: 2026,
      date_start: "2026-03-30",
      date_end: "2026-04-05",
      title: "Q2 Opener",
      pillar: "P3",
      theme: "Patient Marketing Push",
      status: "draft",
    },
  ];

  for (const week of weeksToCreate) {
    // Check if already exists
    const { data: existing } = await supabase
      .from("weeks")
      .select("id")
      .eq("company_id", company.id)
      .eq("week_number", week.week_number)
      .eq("year", week.year);

    if (existing && existing.length > 0) {
      console.log(`   Week ${week.week_number} already exists, skipping.`);
      continue;
    }

    const { error: weekErr } = await supabase
      .from("weeks")
      .insert({ company_id: company.id, ...week });

    if (weekErr) {
      console.error(`   Week ${week.week_number} failed: ${weekErr.message}`);
    } else {
      console.log(`   Week ${week.week_number} created (${week.date_start} to ${week.date_end})`);
    }
  }

  // 4. Import topics
  console.log("\n4. Importing topics from topic bank...");
  const topicsPath = resolve(__dirname, "topics.json");
  let topicsData;
  try {
    topicsData = JSON.parse(readFileSync(topicsPath, "utf-8"));
  } catch {
    console.error(`   Could not read topics at: ${topicsPath}`);
    process.exit(1);
  }

  // Check how many already exist
  const { count: existingCount } = await supabase
    .from("topic_bank")
    .select("*", { count: "exact", head: true })
    .eq("company_id", company.id);

  if (existingCount && existingCount > 0) {
    console.log(`   ${existingCount} topics already exist. Upserting...`);
  }

  // Batch insert in chunks of 50
  const rows = topicsData.map((t) => ({
    company_id: company.id,
    topic_number: t.topicNumber,
    title: t.title,
    pillar: t.pillar || null,
    audience_theme: t.audienceTheme || null,
    description: t.description || null,
  }));

  const chunkSize = 50;
  let imported = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error: topicErr } = await supabase
      .from("topic_bank")
      .upsert(chunk, { onConflict: "company_id,topic_number" });

    if (topicErr) {
      console.error(`   Chunk ${i}-${i + chunk.length} failed: ${topicErr.message}`);
    } else {
      imported += chunk.length;
    }
  }
  console.log(`   ${imported} topics imported/updated.`);

  // 5. Configure Anthropic API key
  if (anthropicKey) {
    console.log("\n5. Configuring Anthropic API key...");

    // Check for existing config
    const { data: existingConfig } = await supabase
      .from("company_api_configs")
      .select("id")
      .eq("company_id", company.id)
      .eq("service_category", "content_generation");

    const credentialsEncrypted = encryptJson({ api_key: anthropicKey });

    if (existingConfig && existingConfig.length > 0) {
      const { error: updateErr } = await supabase
        .from("company_api_configs")
        .update({
          provider: "anthropic_claude",
          credentials_encrypted: credentialsEncrypted,
          is_active: true,
        })
        .eq("id", existingConfig[0].id);

      if (updateErr) {
        console.error(`   API config update failed: ${updateErr.message}`);
      } else {
        console.log("   Anthropic API key updated.");
      }
    } else {
      const { error: insertErr } = await supabase
        .from("company_api_configs")
        .insert({
          company_id: company.id,
          service_category: "content_generation",
          provider: "anthropic_claude",
          credentials_encrypted: credentialsEncrypted,
          provider_settings: { model: "claude-sonnet-4-20250514" },
          is_active: true,
        });

      if (insertErr) {
        console.error(`   API config insert failed: ${insertErr.message}`);
      } else {
        console.log("   Anthropic API key configured (claude-sonnet-4-20250514).");
      }
    }
  } else {
    console.log("\n5. Skipping Anthropic API key (no --anthropic-key provided).");
    console.log("   You can add it later via the UI at:");
    console.log(`   /admin/companies/${company.id}/api-providers`);
  }

  // Summary
  console.log("\n=== Done ===\n");
  console.log("Next steps:");
  console.log("  1. Run migration 003 in Supabase SQL Editor (if not done yet)");
  console.log("  2. Go to /admin/generate/batch to generate a full week");
  if (!anthropicKey) {
    console.log("  3. Configure your Anthropic API key in API Providers");
  }
  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
