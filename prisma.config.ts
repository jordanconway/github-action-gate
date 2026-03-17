// SPDX-FileCopyrightText: 2026 The Linux Foundation
//
// SPDX-License-Identifier: Apache-2.0

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
