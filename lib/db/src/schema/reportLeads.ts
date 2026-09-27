import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// report_leads — one row per "email me my report" request
//
// Written BEFORE any email is sent, so a lead survives an SMTP2Go outage.
// report_status: 'pending' | 'sent' | 'failed'
// ---------------------------------------------------------------------------
export const reportLeads = sqliteTable('report_leads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  url: text('url').notNull(),
  score: integer('score').notNull(),
  reportStatus: text('report_status').notNull().default('pending'),
  reportEmailId: text('report_email_id'),
  reportError: text('report_error'),
  ownerNotified: integer('owner_notified', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type ReportLead = typeof reportLeads.$inferSelect;
