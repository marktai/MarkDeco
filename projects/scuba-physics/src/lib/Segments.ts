import { Gas } from './Gases';
import { DepthConverter } from './depth-converter';

export class SegmentsValidator {
    public static validate(segments: Segments, maxPpo: number, depthConverter: DepthConverter): string[] {
        const messages: string[] = [];

        if (!segments.any()) {
            messages.push('There needs to be at least one segment at depth.');
        }

        segments.foreach(segment => {
            this.validateGas(messages, segment, maxPpo, depthConverter);
        });

        return messages;
    }

    private static validateGas(messages: string[], segment: Segment, maxPpo: number, depthConverter: DepthConverter): void {
        // TODO move to validator
        // if (!gases.isRegistered(gas)) {
        //     throw new Error('Gas must only be one of registered gases. Please use plan.addBottomGas or plan.addDecoGas to register a gas.');
        // }

        const segmentMod = Math.max(segment.startDepth, segment.endDepth);
        const gasMod = segment.gas.mod(maxPpo, depthConverter);

        if (segmentMod > gasMod) {
            messages.push('Gas is not breathable at bottom segment depth.');
        }

        const segmentCeiling = Math.min(segment.startDepth, segment.endDepth);
        const gasCeiling = segment.gas.ceiling(depthConverter);

        if (gasCeiling > segmentCeiling) {
            messages.push('Gas is not breathable at segment ceiling.');
        }
    }
}

export class Segment {
    constructor (
        public startDepth: number,
        public endDepth: number,
        public gas: Gas,
        public duration: number) {}

    public levelEquals(toCompare: Segment): boolean {
        return this.isFlat &&
            toCompare.isFlat &&
            this.startDepth === toCompare.startDepth &&
            this.gas === toCompare.gas;
    }

    public get speed(): number {
        return (this.endDepth - this.startDepth) / this.duration;
    }

    public get isFlat(): boolean {
        return this.startDepth === this.endDepth;
    }

    public addTime(toAdd: Segment): void {
        this.duration += toAdd.duration;
    }
}

export class Segments {
    private segments: Segment[] = [];

    public add(startDepth: number, endDepth: number, gas: Gas, duration: number): Segment {
        const segment = new Segment(startDepth, endDepth, gas, duration);
        this.segments.push(segment);
        return segment;
    }

    public enterWater(gas: Gas, speed: number, depth: number) {
        const duration = depth / speed;
        this.add(0, depth, gas, duration);
    }

    public addFlat(depth: number, gas: Gas, duration: number) {
        this.add(depth, depth, gas, duration);
    }

    public mergeFlat(): Segment[] {
        const toRemove = [];
        for (let index = this.segments.length - 1; index > 0; index--) {
            const segment1 = this.segments[index - 1];
            const segment2 = this.segments[index];
            if (segment1.levelEquals(segment2)) {
                segment1.addTime(segment2);
                toRemove.push(segment2);
            }
        }

        this.segments = this.segments.filter(s => !toRemove.includes(s));
        return this.segments;
    }

    public foreach(callBack: (segment: Segment) => void): void {
        this.segments.forEach((segment, index, source) => {
            callBack(segment);
        });
    }

    public any(): boolean {
        return this.segments.length !== 0;
    }

    public last(): Segment {
        return this.segments[this.segments.length - 1];
    }
}
