# Claude Nov 11 source preservation

This branch preserves the previously uncommitted platform/media/browser work copied from /Users/zanewolf/Documents/tnn-platform at 1272cb9. The original checkout and all its uncommitted work remain unchanged. Claude's local session 2c52c957-0097-41d5-82b1-022f3f0ad9f5 reported that this work had already been published on Nov 11 without committing it; that historical claim is not evidence of current live byte parity.

New source includes media uploads/recovery/status, sharing/deliverables, browser gateway/startup scripts, and associated platform/chat/approval changes. No service was restarted, installer executed, new migration applied, account created, email sent, or production site deployed during this preservation.

Validation: media-server tests pass (31/31). Platform Vite production bundle builds successfully. ESLint fails with 20 errors and 3 warnings in the copied source, including existing hook/lifecycle issues, inline SidebarContent creation, and unused bindings. These are recorded rather than hidden or silently fixed in an exact preservation commit. No production readiness claim is made.

Environment files, dependencies, build output and Claude configuration were not included. Automated scans found no service JWT, personal access token, sb_secret key or private-key block in changed/new source; this is not a guarantee against every secret format. The existing add_media/add_deliverables SQL is historical source, not a newly approved migration. Compare it to the full live baseline and prepare reversible changes before any future application. It was not executed here.

{{TODO: resolve the lint findings on a subsequent review branch, verify current production parity, and integrate the approved platform migration/security work only after the corresponding phase gates}}.
