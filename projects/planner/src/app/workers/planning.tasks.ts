import {
    Segments, Gases, ProfileEvents, DepthConverterFactory,
    Consumption, Time, Diver, OtuCalculator, CnsCalculator,
    DensityAtDepth, EventOptions, AlgorithmParams, BuhlmannAlgorithm,
    RestingParameters, Segment, PlanFactory, ConsumptionOptions, ProfileMoment
} from 'scuba-physics';
import {
    ProfileRequestDto, ProfileResultDto, ConsumptionRequestDto,
    ConsumptionResultDto, DiveInfoResultDto
} from '../shared/serialization.model';
import { DtoSerialization } from '../shared/dtoSerialization';

export class PlanningTasks {
    /** 1. Calculate profile */
    public static calculateDecompression(task: ProfileRequestDto): ProfileResultDto {
        const parameters = this.profileParametersFromTask(task);
        const algorithm = new BuhlmannAlgorithm();
        const profile = algorithm.decompression(parameters);
        const profileDto = DtoSerialization.fromProfile(profile);
        const eventOptions: EventOptions = {
            maxDensity: task.eventOptions.maxDensity,
            startAscentIndex: parameters.segments.startAscentIndex,
            profile: profile.segments,
            ceilings: profile.ceilings,
            profileOptions: parameters.options
        };
        const events = ProfileEvents.fromProfile(eventOptions);
        const eventsDto = DtoSerialization.fromEvents(events.items);

        return {
            diveId: task.diveId,
            profile: profileDto,
            events: eventsDto
        };
    }

    /** 2.A calculate dive results */
    public static diveInfo(task: ProfileRequestDto): DiveInfoResultDto {
        // we can't speedup the prediction from already obtained profile,
        // since it may happen, the deco starts during ascent.
        // we cant use the maxDepth, because its purpose is only for single level dives
        const parameters = this.profileParametersFromTask(task);
        const algorithm = new BuhlmannAlgorithm();
        const noDecoLimit = algorithm.noDecoLimit(parameters);
        const depthConverter = new DepthConverterFactory(task.options).create();
        const originalProfile = parameters.segments.items;
        // TODO following need full calculated profile, not the original one
        const otu = new OtuCalculator(depthConverter).calculateForProfile(originalProfile);
        const cns = new CnsCalculator(depthConverter).calculateForProfile(originalProfile);
        const density = new DensityAtDepth(depthConverter).forProfile(originalProfile);
        const averageDepth = Segments.averageDepth(originalProfile);
        // TODO fill surfaceGF (from LoadedTissues)
        const surfaceGradient = 0;
        // TODO offgasingStartTime and offgasingStartDepth (from Overpressures first from overpressures going trom end, where )
        const offgasingStart = { runtime: 0, depth: 0 };

        return {
            diveId: task.diveId,
            noDeco: noDecoLimit,
            otu: otu,
            cns: cns,
            density: DtoSerialization.fromDensity(density),
            averageDepth: averageDepth,
            surfaceGradient: surfaceGradient,
            offgasingStart: offgasingStart
        };
    }

    /** 2.B calculate consumption only as the most time consuming operation */
    public static calculateConsumption(task: ConsumptionRequestDto): ConsumptionResultDto {
        const depthConverter = new DepthConverterFactory(task.options).create();
        const consumption = new Consumption(depthConverter);

        // deserialize
        const tanks = DtoSerialization.toTanks(task.tanks);
        const originProfile = DtoSerialization.toSegments(task.profile, tanks);
        const segments = DtoSerialization.toSegments(task.plan, tanks);

        // diver ppO2 is irrelevant for consumption calculation
        const diverDto = task.consumptionOptions.diver;
        const diver = new Diver(diverDto.rmv, diverDto.stressRmv);

        const options = DtoSerialization.toOptions(task.options);
        const plan = PlanningTasks.selectConsumptionPlan(segments, task.isComplex);
        const consumptionOptions: ConsumptionOptions = {
            diver: diver,
            primaryTankReserve: task.consumptionOptions.primaryTankReserve,
            stageTankReserve: task.consumptionOptions.stageTankReserve,
        };

        // Max bottom changes tank consumed bars, so we need it calculate before real profile consumption
        const maxTime = consumption.calculateMaxBottomTime(plan, tanks, consumptionOptions, options);

        const emergencyAscent = PlanFactory.emergencyAscent(originProfile, options, tanks);
        let timeToSurface = Segments.duration(emergencyAscent);
        timeToSurface = Time.toMinutes(timeToSurface);
        consumption.consumeFromTanks2(originProfile, emergencyAscent, tanks, consumptionOptions);

        return {
            diveId: task.diveId,
            maxTime: maxTime,
            timeToSurface: timeToSurface,
            tanks: DtoSerialization.toConsumed(tanks),
        };
    }

    private static selectConsumptionPlan(segments: Segment[], isComplex: boolean): Segments {
        if(isComplex) {
            return Segments.fromCollection(segments);
        }

        // In simple view we are able to calculate the max time from descent only.
        // Otherwise the maxTime is always 0 min if already planned dive which takes longer than maximum.
        const descent = segments.slice(0, 1);
        return Segments.fromCollection(descent);
    }

    private static profileParametersFromTask(task: ProfileRequestDto): AlgorithmParams {
        const tanks = DtoSerialization.toTanks(task.tanks);
        const gases = Gases.fromTanks(tanks);
        const originProfile = DtoSerialization.toSegments(task.plan, tanks);
        const segments = Segments.fromCollection(originProfile);
        const options = DtoSerialization.toOptions(task.options);
        const tissues = DtoSerialization.toTissues(task.tissues);
        const rest = new RestingParameters(tissues, task.surfaceInterval);
        return AlgorithmParams.forMultilevelDive(segments, gases, options, rest);
    }
}
