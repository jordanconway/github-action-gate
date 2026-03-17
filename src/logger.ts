// SPDX-FileCopyrightText: 2026 The Linux Foundation
//
// SPDX-License-Identifier: Apache-2.0

import pino from "pino";

export const logger = pino({
  name: "action-gate",
  level: process.env.LOG_LEVEL ?? "info",
});
