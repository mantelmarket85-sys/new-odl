-- Course Coordinator: Theory/Lab credit-hour breakdown (additive, nullable).
-- creditHours stays the TOTAL. hasLab flags a lab component; theoryCredit /
-- labCredit give the split shown as "Theory+Lab" (e.g. 3+1). Existing rows
-- keep creditHours and fall back to it for display.
ALTER TABLE "LmsCourse" ADD COLUMN "hasLab" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LmsCourse" ADD COLUMN "theoryCredit" INTEGER;
ALTER TABLE "LmsCourse" ADD COLUMN "labCredit" INTEGER;
