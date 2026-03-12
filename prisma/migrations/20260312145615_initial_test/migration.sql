-- CreateEnum
CREATE TYPE "GateMode" AS ENUM ('AUDIT', 'BLOCK');

-- CreateEnum
CREATE TYPE "AttestationTier" AS ENUM ('USER', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "mode" "GateMode" NOT NULL DEFAULT 'AUDIT',
    "expiryDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "workflowPath" TEXT NOT NULL,
    "jobName" TEXT,
    "voucherGithubLogin" TEXT NOT NULL,
    "voucherGithubId" INTEGER NOT NULL,
    "voucherOrgAffiliation" TEXT,
    "tier" "AttestationTier" NOT NULL,
    "orgGithubLogin" TEXT,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubId_key" ON "Repository"("githubId");

-- CreateIndex
CREATE INDEX "Repository_owner_idx" ON "Repository"("owner");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_key" ON "Repository"("owner", "name");

-- CreateIndex
CREATE INDEX "Attestation_repositoryId_workflowPath_idx" ON "Attestation"("repositoryId", "workflowPath");

-- CreateIndex
CREATE INDEX "Attestation_repositoryId_workflowPath_jobName_idx" ON "Attestation"("repositoryId", "workflowPath", "jobName");

-- CreateIndex
CREATE INDEX "Attestation_voucherGithubLogin_idx" ON "Attestation"("voucherGithubLogin");

-- CreateIndex
CREATE INDEX "Attestation_orgGithubLogin_idx" ON "Attestation"("orgGithubLogin");

-- CreateIndex
CREATE INDEX "Attestation_expiresAt_idx" ON "Attestation"("expiresAt");

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
