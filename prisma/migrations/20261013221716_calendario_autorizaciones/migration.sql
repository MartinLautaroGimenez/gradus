-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('EVALUACION', 'ACTO', 'FERIADO', 'RECESO', 'REUNION', 'SALIDA', 'OTRO');

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "EventKind" NOT NULL DEFAULT 'OTRO',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "time" TEXT,
    "location" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventCourse" (
    "eventId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "CalendarEventCourse_pkey" PRIMARY KEY ("eventId","courseId")
);

-- CreateTable
CREATE TABLE "AuthorizationRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventDate" DATE,
    "deadline" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationCourse" (
    "requestId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "AuthorizationCourse_pkey" PRIMARY KEY ("requestId","courseId")
);

-- CreateTable
CREATE TABLE "AuthorizationResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "guardianId" TEXT,
    "authorized" BOOLEAN NOT NULL,
    "comment" TEXT,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_startDate_idx" ON "CalendarEvent"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationResponse_requestId_enrollmentId_key" ON "AuthorizationResponse"("requestId", "enrollmentId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventCourse" ADD CONSTRAINT "CalendarEventCourse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventCourse" ADD CONSTRAINT "CalendarEventCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationCourse" ADD CONSTRAINT "AuthorizationCourse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AuthorizationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationCourse" ADD CONSTRAINT "AuthorizationCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationResponse" ADD CONSTRAINT "AuthorizationResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AuthorizationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationResponse" ADD CONSTRAINT "AuthorizationResponse_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationResponse" ADD CONSTRAINT "AuthorizationResponse_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
