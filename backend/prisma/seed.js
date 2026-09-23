const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Migrate legacy roles
  await prisma.user.updateMany({ where: { role: 'admin' }, data: { role: 'director_admissions' } });

  // Deactivate legacy ADP-SE
  await prisma.program.updateMany({
    where: { code: 'ADP-SE' },
    data: { isActive: false },
  });

  // ============================================================
  // Coordinator (created before department so it can be linked)
  // ============================================================
  const coordHash = await bcrypt.hash('coord123', 10);
  const coordinator = await prisma.user.upsert({
    where: { email: 'coordinator@aust.edu.pk' },
    update: { username: 'coordinator', role: 'coordinator', isActive: true },
    create: {
      email: 'coordinator@aust.edu.pk',
      username: 'coordinator',
      password: coordHash,
      role: 'coordinator',
      emailVerified: true,
      isActive: true,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      privacyAccepted: true,
      privacyAcceptedAt: new Date(),
    },
  });
  console.log(`Coordinator created: ${coordinator.email} / coord123`);

  // ============================================================
  // Computing Department + Associate Degree in Computer Science (ADCS)
  // ============================================================
  const computing = await prisma.department.upsert({
    where: { name: 'Department of Computing' },
    update: { coordinatorId: coordinator.id, isActive: true, faculty: 'Faculty of Computing' },
    create: {
      name: 'Department of Computing',
      faculty: 'Faculty of Computing',
      coordinatorId: coordinator.id,
      isActive: true,
    },
  });
  console.log(`Department created: ${computing.name}`);

  // Migrate any legacy ADP-CS row → ADCS, otherwise create fresh.
  const legacy = await prisma.program.findUnique({ where: { code: 'ADP-CS' } }).catch(() => null);
  if (legacy) {
    await prisma.program.update({
      where: { id: legacy.id },
      data: {
        name: 'Associate Degree in Computer Science',
        code: 'ADCS',
        shortForm: 'ADCS',
        programNumericCode: '06',
        departmentId: computing.id,
        isActive: true,
      },
    });
  }
  const adcs = await prisma.program.upsert({
    where: { code: 'ADCS' },
    update: {
      name: 'Associate Degree in Computer Science',
      shortForm: 'ADCS',
      programNumericCode: '06',
      departmentId: computing.id,
      isActive: true,
    },
    create: {
      name: 'Associate Degree in Computer Science',
      code: 'ADCS',
      shortForm: 'ADCS',
      duration: '2 Years',
      semesters: 4,
      fee: 45000,
      minMarksPercent: 50,
      programNumericCode: '06',
      departmentId: computing.id,
      isActive: true,
    },
  });
  console.log(`Program created: ${adcs.name} (${adcs.shortForm})`);

  // ============================================================
  // Super Admin
  // ============================================================
  const superHash = await bcrypt.hash('superadmin123', 10);
  const now = new Date();
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@aust.edu.pk' },
    update: { role: 'super_admin', username: 'superadmin', isActive: true },
    create: {
      email: 'superadmin@aust.edu.pk',
      username: 'superadmin',
      password: superHash,
      role: 'super_admin',
      emailVerified: true,
      isActive: true,
      termsAccepted: true,
      termsAcceptedAt: now,
      privacyAccepted: true,
      privacyAcceptedAt: now,
    },
  });
  console.log(`Super Admin created: ${superAdmin.email} / superadmin123`);

  // ============================================================
  // Director of Admissions
  // ============================================================
  const directorHash = await bcrypt.hash('director123', 10);
  const director = await prisma.user.upsert({
    where: { email: 'director@aust.edu.pk' },
    update: { role: 'director_admissions', username: 'director', isActive: true },
    create: {
      email: 'director@aust.edu.pk',
      username: 'director',
      password: directorHash,
      role: 'director_admissions',
      emailVerified: true,
      isActive: true,
      termsAccepted: true,
      termsAcceptedAt: now,
      privacyAccepted: true,
      privacyAcceptedAt: now,
    },
  });
  console.log(`Director Admissions created: ${director.email} / director123`);

  // ============================================================
  // Demo student
  // ============================================================
  const studentHash = await bcrypt.hash('student123', 10);
  const student = await prisma.user.upsert({
    where: { email: 'student@example.com' },
    update: { username: 'student', isActive: true },
    create: {
      email: 'student@example.com',
      username: 'student',
      password: studentHash,
      role: 'student',
      emailVerified: true,
      isActive: true,
      termsAccepted: true,
      termsAcceptedAt: now,
      privacyAccepted: true,
      privacyAcceptedAt: now,
    },
  });

  await prisma.profile.upsert({
    where: { userId: student.id },
    update: {
      fatherCnic: '1234567890456',
      guardianPhone: '03001112222',
      whatsappNumber: '03001234567',
      nationality: 'Pakistani',
      countryOfResidence: 'Pakistan',
    },
    create: {
      userId: student.id,
      firstName: 'Ahmed',
      lastName: 'Khan',
      cnic: '1234567890123',
      fatherName: 'Muhammad Khan',
      fatherCnic: '1234567890456',
      guardianPhone: '03001112222',
      whatsappNumber: '03001234567',
      nationality: 'Pakistani',
      countryOfResidence: 'Pakistan',
      dateOfBirth: '2000-01-15',
      address: 'House 1, Street 2, Abbottabad',
      district: 'Abbottabad',
      phone: '03001234567',
      gender: 'Male',
      domicileProvince: 'Khyber Pakhtunkhwa',
      domicileDistrict: 'Abbottabad',
      bloodGroup: 'B+',
      religion: 'Islam',
      maritalStatus: 'Single',
      occupation: 'Student',
      presStreet: 'House 1, Street 2',
      presPostalCode: '22010',
      presVillage: 'Mandian',
      presTehsil: 'Abbottabad',
      presDistrict: 'Abbottabad',
      permStreet: 'House 1, Street 2',
      permPostalCode: '22010',
      permVillage: 'Mandian',
      permTehsil: 'Abbottabad',
      permDistrict: 'Abbottabad',
      permSameAsPresent: true,
      isComplete: true,
    },
  });

  await prisma.education.deleteMany({ where: { userId: student.id } });
  await prisma.education.createMany({
    data: [
      {
        userId: student.id,
        level: '10years',
        degree: 'Matric (SSC)',
        major: 'Science',
        rollNumber: '123456',
        marks: 920,
        totalMarks: 1100,
        grade: 'A+',
        board: 'BISE Abbottabad',
        passingYear: '2018',
        resultStatus: 'Completed',
      },
      {
        userId: student.id,
        level: '12years',
        degree: 'FSc (HSSC)',
        major: 'Pre-Engineering',
        rollNumber: '654321',
        marks: 880,
        totalMarks: 1100,
        grade: 'A',
        board: 'BISE Abbottabad',
        passingYear: '2020',
        resultStatus: 'Completed',
      },
    ],
  });
  console.log(`Demo student created: ${student.email} / student123 (username: student)`);

  // ============================================================
  // Default admission cycle
  // ============================================================
  const cycleCount = await prisma.admissionCycle.count();
  if (cycleCount === 0) {
    const cycle = await prisma.admissionCycle.create({
      data: {
        title: 'Fall 2026 Admissions',
        startDate: '2026-04-01',
        endDate: '2026-12-31',
        isOpen: true,
        minMarksPercent: 50,
        matricWeight: 30,
        fscWeight: 40,
        interviewWeight: 30,
        applicationProcessingFee: 1200,
        allowedPaymentMethods: 'BANK_TRANSFER,EASYPAISA,ONEBILL_VOUCHER',
        bankAccountTitle: 'AUST Admission Account',
        bankAccountNumber: 'PK10NBPA2240004139312551',
        bankName: 'National Bank of Pakistan',
        termCode: 'F26',
      },
    });
    console.log(`Admission cycle created: ${cycle.title}`);

    // Per-program config for ADCS in this cycle (semester/enrollment fee breakdown)
    await prisma.cycleProgram.upsert({
      where: { admissionCycleId_programId: { admissionCycleId: cycle.id, programId: adcs.id } },
      update: {},
      create: {
        admissionCycleId: cycle.id,
        programId: adcs.id,
        meritCriteria: 'Merit = 30% Matric + 40% FSc + 30% Interview',
        minMarksPercent: 50,
        totalSeats: 50,
        feeBreakdown: JSON.stringify([
          { label: 'Admission Fee', amount: 5000 },
          { label: 'Tuition Fee', amount: 35000 },
          { label: 'Examination Fee', amount: 5000 },
        ]),
        totalFee: 45000,
        isOpen: true,
      },
    });
    console.log('CycleProgram (ADCS) created');
  }

  // ============================================================
  // PaymentMethodConfig (singleton row)
  // ============================================================
  const pmCount = await prisma.paymentMethodConfig.count();
  if (pmCount === 0) {
    await prisma.paymentMethodConfig.create({
      data: {
        bankTransferEnabled: true,
        easypaisaEnabled: true,
        onebillEnabled: true,
        onebillCompanyCode: 'AUST01',
        onebillConsumerNumber: '0001234567',
        onebillInstructions: 'Use the 1Bill voucher number at any partner bank, ATM, or mobile wallet to pay the fee. Then enter the transaction id below.',
        easypaisaAccountTitle: 'AUST Admissions',
        easypaisaAccountNumber: '03001234567',
        easypaisaInstructions: 'Send the fee via Easypaisa Mobile Account or any Easypaisa retailer, then enter the transaction id below.',
        bankTransferInstructions: 'Deposit fee in any university bank account listed below and upload the deposit slip image / PDF.',
      },
    });
    console.log('PaymentMethodConfig created');
  }

  // ============================================================
  // Default University Bank Accounts
  // ============================================================
  const defaults = [
    {
      bankName: 'National Bank of Pakistan',
      accountTitle: 'AUST ODL Admissions',
      iban: 'PK10NBPA2240004139312551',
      branchCode: '2240',
      sortOrder: 1,
    },
    {
      bankName: 'Bank of Khyber',
      accountTitle: 'AUST ODL Admissions',
      iban: 'PK09KHYB0040000002683004',
      branchCode: '0040',
      sortOrder: 2,
    },
  ];
  for (const acc of defaults) {
    const existing = await prisma.bankAccount.findFirst({ where: { iban: acc.iban } });
    if (!existing) {
      await prisma.bankAccount.create({ data: acc });
      console.log(`Bank account seeded: ${acc.bankName} (${acc.iban})`);
    }
  }

  // Welcome notification
  const existingWelcome = await prisma.notification.findFirst({
    where: { userId: student.id, title: 'Welcome to AUST Admission System' },
  });
  if (!existingWelcome) {
    await prisma.notification.create({
      data: {
        userId: student.id,
        title: 'Welcome to AUST Admission System',
        message: 'Your account has been created. Please complete your profile and apply for admission.',
      },
    });
  }

  console.log('\n--- Seed Complete ---');
  console.log('Super Admin:  superadmin@aust.edu.pk OR username "superadmin" / superadmin123');
  console.log('Director:     director@aust.edu.pk    OR username "director" / director123');
  console.log('Coordinator:  coordinator@aust.edu.pk OR username "coordinator" / coord123');
  console.log('Student:      student@example.com     OR username "student" / student123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
