-- Weekly Schedule: distinguish Theory vs Lab slots. Lab slots are auto-created
-- for courses with a Lab component and share the offering (same instructor as
-- theory). Additive — legacy rows default to THEORY.
ALTER TABLE "ScheduleSlot" ADD COLUMN "slotType" TEXT NOT NULL DEFAULT 'THEORY';
