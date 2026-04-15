import { z } from "zod";
import { JsonValueSchema } from "../core/config.js";

export const AgentCapabilityRuleSchema = z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
});

export type AgentCapabilityRule = z.infer<typeof AgentCapabilityRuleSchema>;

export const AgentCapabilitySelectorSchema = z.object({
    tool: AgentCapabilityRuleSchema.optional(),
}).catchall(JsonValueSchema);

type AgentCapabilitySelectorBase = z.infer<typeof AgentCapabilitySelectorSchema>;

export type AgentCapabilitySelector = AgentCapabilitySelectorBase & Record<string, unknown>;

export const AgentCapabilityConsumerSchema = z.object({
    consumeAgentCapabilities: z.function(
        z.tuple([AgentCapabilitySelectorSchema]),
        z.promise(z.boolean()),
    ),
});

export type AgentCapabilityConsumer = z.infer<typeof AgentCapabilityConsumerSchema>;

export function getCapabilityNamespace(
    selector: AgentCapabilitySelector,
    key: string,
): unknown {
    return selector[key];
}

function matchPattern(pattern: string, value: string): boolean {
    if (pattern === "*") {
        return true;
    }

    const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    const regex = new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
    return regex.test(value);
}

function matchesAny(value: string, patterns: string[] | undefined): boolean {
    if (patterns === undefined || patterns.length === 0) {
        return false;
    }
    return patterns.some((pattern) => matchPattern(pattern, value));
}

export function isCapabilityEnabled(value: string, rule: AgentCapabilityRule | undefined): boolean {
    const allowMatched = rule?.allow === undefined || rule.allow.length === 0
        ? true
        : matchesAny(value, rule.allow);

    if (!allowMatched) {
        return false;
    }

    return !matchesAny(value, rule?.deny);
}
