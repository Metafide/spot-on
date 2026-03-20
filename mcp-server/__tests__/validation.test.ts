import { describe, it, expect } from "vitest";
import {
  validateInterval,
  validateNetwork,
  validateMaxPositions,
  validatePositionAmount,
  validateStrikePrice,
} from "../src/utils/validation.js";

describe("validation", () => {
  describe("validateInterval", () => {
    it("accepts valid intervals", () => {
      expect(validateInterval(60)).toBe(true);
      expect(validateInterval(3600)).toBe(true);
      expect(validateInterval(86400)).toBe(true);
    });
    it("rejects invalid intervals", () => {
      expect(validateInterval(100)).toBe(false);
      expect(validateInterval(0)).toBe(false);
    });
  });

  describe("validateNetwork", () => {
    it("accepts valid networks", () => {
      expect(validateNetwork("testnet")).toBe(true);
      expect(validateNetwork("mainnet")).toBe(true);
    });
    it("rejects invalid networks", () => {
      expect(validateNetwork("devnet")).toBe(false);
    });
  });

  describe("validateMaxPositions", () => {
    it("accepts 1-10", () => {
      expect(validateMaxPositions(1)).toBe(true);
      expect(validateMaxPositions(10)).toBe(true);
    });
    it("rejects out of range", () => {
      expect(validateMaxPositions(0)).toBe(false);
      expect(validateMaxPositions(11)).toBe(false);
    });
  });

  describe("validatePositionAmount", () => {
    it("validates minimum per interval", () => {
      expect(validatePositionAmount(0.01, 60)).toBe(true);
      expect(validatePositionAmount(0.005, 60)).toBe(false);
      expect(validatePositionAmount(1, 3600)).toBe(true);
      expect(validatePositionAmount(0.5, 3600)).toBe(false);
      expect(validatePositionAmount(5, 86400)).toBe(true);
      expect(validatePositionAmount(4, 86400)).toBe(false);
    });
  });

  describe("validateStrikePrice", () => {
    it("accepts positive numbers", () => {
      expect(validateStrikePrice(68000)).toBe(true);
    });
    it("rejects zero and negative", () => {
      expect(validateStrikePrice(0)).toBe(false);
      expect(validateStrikePrice(-100)).toBe(false);
    });
  });
});
