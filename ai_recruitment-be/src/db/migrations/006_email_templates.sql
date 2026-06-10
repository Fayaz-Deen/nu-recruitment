-- Email templates stored per company, editable by admins

CREATE TABLE IF NOT EXISTS email_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(60) UNIQUE NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  subject     TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  variables   JSONB       NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);

-- ── Seed default templates ────────────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, subject, body, variables)
VALUES (
  'user_invite',
  'User Invite',
  'Sent when an admin invites a new team member to the platform.',
  'You''ve been invited to {{company_name}}',
  '<p>Hi,</p>
<p>You have been invited to join <strong>{{company_name}}</strong> as <strong>{{role_label}}</strong> by {{inviter_name}}.</p>
<p>Click the link below to set up your account (valid for 48 hours):</p>
<p><a href="{{invite_link}}">{{invite_link}}</a></p>
<p>If you weren''t expecting this, you can safely ignore this email.</p>',
  '[
    {"key": "company_name",  "label": "Company name",   "description": "Your company name from company profile", "example": "Acme Inc."},
    {"key": "inviter_name",  "label": "Inviter name",   "description": "Full name of the person sending the invite", "example": "Sarah Chen"},
    {"key": "role_label",    "label": "Role",            "description": "Human-readable role assigned to the invitee", "example": "Recruiter"},
    {"key": "invite_link",   "label": "Invite link",    "description": "Account setup URL — required", "example": "https://app.example.com/accept-invite?token=xxx"}
  ]'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO email_templates (key, name, description, subject, body, variables)
VALUES (
  'password_reset',
  'Password Reset',
  'Sent when a user requests a password reset link.',
  'Reset your {{company_name}} password',
  '<p>Hi {{user_name}},</p>
<p>We received a request to reset your <strong>{{company_name}}</strong> password. Click the link below (valid for 1 hour):</p>
<p><a href="{{reset_link}}">{{reset_link}}</a></p>
<p>If you did not request this, you can safely ignore this email.</p>',
  '[
    {"key": "company_name", "label": "Company name", "description": "Your company name from company profile", "example": "Acme Inc."},
    {"key": "user_name",    "label": "User name",    "description": "Display name of the user requesting reset", "example": "Alex Morgan"},
    {"key": "reset_link",   "label": "Reset link",   "description": "Password reset URL — required", "example": "https://app.example.com/reset-password?token=xxx"}
  ]'
)
ON CONFLICT (key) DO NOTHING;
