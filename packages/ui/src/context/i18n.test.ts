import { describe, expect, test } from "bun:test"
import { pluralCategory } from "./i18n"

describe("pluralCategory", () => {
  test.each([
    ["en", 0, "other"],
    ["en", 1, "one"],
    ["zh", 0, "other"],
    ["zh", 1, "other"],
    ["zht", 2, "other"],
  ] as const)("selects %s for %d as %s", (locale, count, expected) => {
    expect(pluralCategory(locale, count)).toBe(expected)
  })
})
