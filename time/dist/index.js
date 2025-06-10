#!/usr/bin/env node

// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import weekOfYear from "dayjs/plugin/weekOfYear.js";
import isoWeek from "dayjs/plugin/isoWeek.js";
import dayjs from "dayjs";
dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);
var server = new Server({
  name: "time-mcp",
  version: "0.0.1"
}, {
  capabilities: {
    tools: {},
    logging: {}
  }
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [CURRENT_TIME, RELATIVE_TIME, DAYS_IN_MONTH, GET_TIMESTAMP, CONVERT_TIME, GET_WEEK_YEAR]
  };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
  const utcTime = dayjs.utc();
  const localTimezone = timezone2 ?? dayjs.tz.guess();
  const localTime = dayjs().tz(localTimezone);
  return {
    utc: utcTime.format(format),
    local: localTime.format(format),
    timezone: localTimezone
  };
}
function getRelativeTime(time) {
  return dayjs(time).fromNow();
}
function getTimestamp(time) {
  return time ? dayjs(time).valueOf() : dayjs().valueOf();
}
function getDaysInMonth(date) {
  return date ? dayjs(date).daysInMonth() : dayjs().daysInMonth();
}
function getWeekOfYear(date) {
  const week = date ? dayjs(date).week() : dayjs().week();
  const isoWeek2 = date ? dayjs(date).isoWeek() : dayjs().isoWeek();
  return {
    week,
    isoWeek: isoWeek2
  };
}
function convertTime(sourceTimezone, targetTimezone, time) {
  const sourceTime = time ? dayjs(time).tz(sourceTimezone) : dayjs().tz(sourceTimezone);
  const targetTime = sourceTime.tz(targetTimezone);
  const formatString = "YYYY-MM-DD HH:mm:ss";
  return {
    sourceTime: sourceTime.format(formatString),
    targetTime: targetTime.format(formatString),
    timeDiff: dayjs(targetTime).diff(dayjs(sourceTime), "hours")
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
    const transport = new StdioServerTransport();
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
export {
  server
};
//# sourceMappingURL=index.js.map