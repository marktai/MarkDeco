export enum StandardGas {
    Air = 21,
    EAN32 = 32,
    EAN36 = 36,
    EAN38 = 38,
    EAN50 = 50,
    OXYGEN = 100
}

export class Gases {
    public static gasNames(): string[] {
        return Object.keys(StandardGas)
            .filter(k => typeof StandardGas[k] === 'number') as string[];
    }
}

export class Gas {
    public consumed = 0;

    constructor(public size: number,
        public o2: number,
        public startPressure: number) {
    }

    public get volume(): number {
        return this.size * this.startPressure;
    }

    public get name(): string {
        const fromEnum = StandardGas[this.o2];
        if (fromEnum) {
            return fromEnum;
        }

        if (this.o2) {
            return 'EAN' + this.o2.toString();
        }

        return '';
    }

    public assignStandardGas(standard: string): void {
        this.o2 = StandardGas[standard];
    }

    public get endPressure(): number {
        return this.startPressure - this.consumed;
    }

    public loadFrom(other: Gas): void {
        this.startPressure = other.startPressure;
        this.size = other.size;
        this.o2 = other.o2;
    }
}

export class Diver {
    // meter/min.
    public static readonly descSpeed = 20;
    public static readonly ascSpeed = 10;

    constructor(public sac: number, public maxPpO2: number) {
    }

    public get stressSac(): number {
        return this.sac * 3;
    }

    public static gasSac(sac: number, gasSize: number): number {
        return sac / gasSize;
    }

    public gasSac(gas: Gas): number {
        return Diver.gasSac(this.sac, gas.size);
    }

    public loadFrom(other: Diver): void {
        this.sac = other.sac;
    }
}

export enum Strategies {
    ALL = 1,
    HALF = 2,
    THIRD = 3
}

export class Plan {
    constructor(public duration: number, public depth: number, public strategy: Strategies) {
    }

    public get availablePressureRatio(): number {
        return this.strategy === Strategies.THIRD ? 2 / 3 : 1;
    }

    public get needsReturn(): boolean {
        return this.strategy !== Strategies.ALL;
    }

    public get needsSafetyStop(): boolean {
        return this.depth >= SafetyStop.mandatoryDepth;
    }

    public loadFrom(other: Plan): void {
        this.depth = other.depth;
        this.duration = other.duration;
        this.strategy = other.strategy;
    }
}

export class Dive {
    public calculated = false;
    public maxTime = 0;
    public rockBottom = 0;
    public timeToSurface = 0;
    public turnPressure = 0;
    public turnTime = 0;
    public needsReturn = false;
    public notEnoughGas = false;
    public depthExceeded = false;
    public notEnoughTime = false;
    public wayPoints: WayPoint[] = [];

    public get hasErrors(): boolean {
        return this.calculated && (this.notEnoughGas || this.depthExceeded || this.notEnoughTime);
    }
}

export class WayPoint {
    private static timeScaling = 10;
    private static depthScaling = 10;
    public x1 = 0;
    public y1 = 0;
    public x2 = 0;
    public y2 = 0;
    constructor(public duration: number, public endDepth: number) {
        this.x2 = duration * WayPoint.timeScaling;
        this.y2 = endDepth * WayPoint.depthScaling;
    }

    public get label(): string {
        if (this.y1 !== this.y2) {
            return '';
        }

        const depth = this.endDepth + ' m';
        const durationText = this.duration + ' min.';
        return depth + ',' + durationText;
    }

    public toLevel(duration: number, newDepth: number): WayPoint {
        const result = new WayPoint(duration, newDepth);
        result.x1 = this.x2;
        result.y1 = this.y2;
        result.x2 = this.x2 + duration * WayPoint.timeScaling;
        result.y2 = newDepth * WayPoint.depthScaling;
        return result;
    }
}

export class SafetyStop {
    public static readonly depth = 5;
    public static readonly duration = 3;
    public static readonly mandatoryDepth = 20;
}
