#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  server: () => server
});
module.exports = __toCommonJS(index_exports);
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");

// src/tools.ts
var CURRENT_TIME = {
  name: "current_time",
  description: "Get the current date and time.",
  inputSchema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        description: "The format of the time, default is empty string",
        enum: [
          "h:mm A",
          "h:mm:ss A",
          "YYYY-MM-DD HH:mm:ss",
          "YYYY-MM-DD",
          "YYYY-MM",
          "MM/DD/YYYY",
          "MM/DD/YY",
          "YYYY/MM/DD",
          "YYYY/MM"
        ],
        default: "YYYY-MM-DD HH:mm:ss"
      },
      timezone: {
        type: "string",
        description: "The timezone of the time, IANA timezone name, e.g. Asia/Shanghai",
        default: void 0
      }
    },
    required: ["format"]
  }
};
var RELATIVE_TIME = {
  name: "relative_time",
  description: "Get the relative time from now.",
  inputSchema: {
    type: "object",
    properties: {
      time: {
        type: "string",
        description: "The time to get the relative time from now. Format: YYYY-MM-DD HH:mm:ss"
      }
    },
    required: ["time"]
  }
};
var DAYS_IN_MONTH = {
  name: "days_in_month",
  description: "Get the number of days in a month. If no date is provided, get the number of days in the current month.",
  inputSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "The date to get the days in month. Format: YYYY-MM-DD"
      }
    }
  }
};
var GET_TIMESTAMP = {
  name: "get_timestamp",
  description: "Get the timestamp for the time.",
  inputSchema: {
    type: "object",
    properties: {
      time: {
        type: "string",
        description: "The time to get the timestamp. Format: YYYY-MM-DD HH:mm:ss"
      }
    }
  }
};
var CONVERT_TIME = {
  name: "convert_time",
  description: "Convert time between timezones.",
  inputSchema: {
    type: "object",
    properties: {
      sourceTimezone: {
        type: "string",
        description: "The source timezone. IANA timezone name, e.g. Asia/Shanghai"
      },
      targetTimezone: {
        type: "string",
        description: "The target timezone. IANA timezone name, e.g. Europe/London"
      },
      time: {
        type: "string",
        description: "Date and time in 24-hour format. e.g. 2025-03-23 12:30:00"
      }
    },
    required: ["sourceTimezone", "targetTimezone", "time"]
  }
};
var GET_WEEK_YEAR = {
  name: "get_week_year",
  description: "Get the week and isoWeek of the year.",
  inputSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "The date to get the week and isoWeek of the year. e.g. 2025-03-23"
      }
    }
  }
};

// src/index.ts
var import_relativeTime = __toESM(require("dayjs/plugin/relativeTime.js"), 1);
var import_utc = __toESM(require("dayjs/plugin/utc.js"), 1);
var import_timezone = __toESM(require("dayjs/plugin/timezone.js"), 1);
var import_weekOfYear = __toESM(require("dayjs/plugin/weekOfYear.js"), 1);
var import_isoWeek = __toESM(require("dayjs/plugin/isoWeek.js"), 1);
var import_dayjs = __toESM(require("dayjs"), 1);
import_dayjs.default.extend(import_relativeTime.default);
import_dayjs.default.extend(import_utc.default);
import_dayjs.default.extend(import_timezone.default);
import_dayjs.default.extend(import_weekOfYear.default);
import_dayjs.default.extend(import_isoWeek.default);
var server = new import_server.Server({
  name: "time-mcp",
  version: "0.0.1"
}, {
  capabilities: {
    tools: {},
    logging: {}
  }
});
server.setRequestHandler(import_types.ListToolsRequestSchema, async () => {
  return {
    tools: [CURRENT_TIME, RELATIVE_TIME, DAYS_IN_MONTH, GET_TIMESTAMP, CONVERT_TIME, GET_WEEK_YEAR]
  };
});
server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "current_time": {
        if (!checkCurrentTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const { format, timezone: timezone2 } = args;
        const result = getCurrentTime(format, timezone2);
        return {
          success: true,
          content: [
            {
              type: "text",
              text: `Current UTC time is ${result.utc}, and the time in ${result.timezone} is ${result.local}.`
            }
          ]
        };
      }
      case "relative_time": {
        if (!checkRelativeTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const time = args.time;
        const result = getRelativeTime(time);
        return {
          success: true,
          content: [
            {
              type: "text",
              text: result
            }
          ]
        };
      }
      case "days_in_month": {
        if (!checkDaysInMonthArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const date = args.date;
        const result = getDaysInMonth(date);
        return {
          success: true,
          content: [
            {
              type: "text",
              text: `The number of days in month is ${result}.`
            }
          ]
        };
      }
      case "get_timestamp": {
        if (!checkTimestampArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const time = args.time;
        const result = getTimestamp(time);
        return {
          success: true,
          content: [
            {
              type: "text",
              text: `The timestamp of ${time} is ${result} ms.`
            }
          ]
        };
      }
      case "convert_time": {
        if (!checkConvertTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const { sourceTimezone, targetTimezone, time } = args;
        const { sourceTime, targetTime, timeDiff } = convertTime(sourceTimezone, targetTimezone, time);
        return {
          success: true,
          content: [
            {
              type: "text",
              text: `Current time in ${sourceTimezone} is ${sourceTime}, and the time in ${targetTimezone} is ${targetTime}. The time difference is ${timeDiff} hours.`
            }
          ]
        };
      }
      case "get_week_year": {
        if (!checkWeekOfYearArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const { date } = args;
        const { week, isoWeek: isoWeek2 } = getWeekOfYear(date);
        return {
          success: true,
          content: [
            {
              type: "text",
              text: `The week of the year is ${week}, and the isoWeek of the year is ${isoWeek2}.`
            }
          ]
        };
      }
      default: {
        throw new Error(`Unknown tool: ${name}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      content: [
        {
          type: "text",
          text: message
        }
      ]
    };
  }
});
function getCurrentTime(format, timezone2) {
  const utcTime = import_dayjs.default.utc();
  const localTimezone = timezone2 ?? import_dayjs.default.tz.guess();
  const localTime = (0, import_dayjs.default)().tz(localTimezone);
  return {
    utc: utcTime.format(format),
    local: localTime.format(format),
    timezone: localTimezone
  };
}
function getRelativeTime(time) {
  return (0, import_dayjs.default)(time).fromNow();
}
function getTimestamp(time) {
  return time ? (0, import_dayjs.default)(time).valueOf() : (0, import_dayjs.default)().valueOf();
}
function getDaysInMonth(date) {
  return date ? (0, import_dayjs.default)(date).daysInMonth() : (0, import_dayjs.default)().daysInMonth();
}
function getWeekOfYear(date) {
  const week = date ? (0, import_dayjs.default)(date).week() : (0, import_dayjs.default)().week();
  const isoWeek2 = date ? (0, import_dayjs.default)(date).isoWeek() : (0, import_dayjs.default)().isoWeek();
  return {
    week,
    isoWeek: isoWeek2
  };
}
function convertTime(sourceTimezone, targetTimezone, time) {
  const sourceTime = time ? (0, import_dayjs.default)(time).tz(sourceTimezone) : (0, import_dayjs.default)().tz(sourceTimezone);
  const targetTime = sourceTime.tz(targetTimezone);
  const formatString = "YYYY-MM-DD HH:mm:ss";
  return {
    sourceTime: sourceTime.format(formatString),
    targetTime: targetTime.format(formatString),
    timeDiff: (0, import_dayjs.default)(targetTime).diff((0, import_dayjs.default)(sourceTime), "hours")
  };
}
function checkCurrentTimeArgs(args) {
  return typeof args === "object" && args !== null && "format" in args && typeof args.format === "string" && ("timezone" in args ? typeof args.timezone === "string" : true);
}
function checkRelativeTimeArgs(args) {
  return typeof args === "object" && args !== null && "time" in args && typeof args.time === "string";
}
function checkDaysInMonthArgs(args) {
  return typeof args === "object" && args !== null && "date" in args && typeof args.date === "string";
}
function checkTimestampArgs(args) {
  return typeof args === "object" && args !== null && "time" in args && (typeof args.time === "string" || args.time === void 0);
}
function checkConvertTimeArgs(args) {
  return typeof args === "object" && args !== null && "sourceTimezone" in args && typeof args.sourceTimezone === "string" && "targetTimezone" in args && typeof args.targetTimezone === "string" && "time" in args && typeof args.time === "string";
}
function checkWeekOfYearArgs(args) {
  return typeof args === "object" && args !== null && ("date" in args ? typeof args.date === "string" : true);
}
async function runServer() {
  try {
    process.stdout.write("Starting Time MCP server...\n");
    const transport = new import_stdio.StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error starting Time MCP server: ${message}
`);
    process.exit(1);
  }
}
runServer().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error running Time MCP server: ${errorMessage}
`);
  process.exit(1);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  server
});
//# sourceMappingURL=index.cjs.map