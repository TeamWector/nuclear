declare namespace wow {
  interface CGUnit {
    target?: CGUnit;
    targetUnit?: CGUnit;
    predictedHealthPercent: number;
    timeToDeath(): number | undefined;
    isPlayer(): boolean;
    hasAura(identifier: string | number): boolean;
    hasVisibleAura(identifier: string | number): boolean;
    hasVisibleAuraByMe(identifier: string | number): boolean;
    getAura(identifier: string | number): AuraData | undefined;
    getAuraByMe(identifier: string | number): AuraData | undefined;
    getAuraStacks(identifier: string | number): number;
    getUnitsAround(distance: number): Array<CGUnit>;
    getUnitsAroundCount(distance: number): Array<CGUnit>;
    isMoving(): boolean;
    inCombat(): boolean;
    inCombatWith(unit: CGUnit | Guid): boolean;
    inCombatWithMe: boolean;
    isSitting(): boolean;
    isSwimming(): boolean;
    isStunned(): boolean;
    isRooted(): boolean;
    isSilenced(): boolean;
    isFeared(): boolean;
    angleToXY(x1: number, y1: number, x2: number, y2: number): number;
    angleToPos(from: Vector3, to: Vector3): number;
    angleTo(target: CGUnit): number;
    isFacing(target: CGUnit, angle: number): boolean;
    radToDeg(radians: number): number;
    inMyGroup(): boolean;
    isTanking(): boolean;
    withinLineOfSight(target: CGUnit): boolean;
    isImmune(): boolean;
    isHealImmune(): boolean;
    isWithinMeleeRange(target: CGUnit): boolean;
    isSlowed(): boolean;
    isHealer(): boolean;
  }
}
