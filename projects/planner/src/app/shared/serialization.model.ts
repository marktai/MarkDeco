import {
    Tank, Ceiling, EventType,
    Salinity, SafetyStop
} from 'scuba-physics';

export interface AppPreferences extends AppPreferencesDto {
    states: AppStates;
}

export interface AppStates {
    /** route to the last page opened */
    lastScreen: string;
    /** all other views than plan, because its state are dives */
    states: ViewState[];
}

export interface AltitudeViewState extends ViewState {
    /** pressure is calculated from altitude */
    altitude: number;
    actualDepth: number;
}

/** We don\'t need mod, since it is calculated */
export interface NitroxViewState extends ViewState {
    fO2: number;
    pO2: number;
}

/** rmv is calculated */
export interface SacViewState extends ViewState {
    avgDepth: number;
    tankSize: number;
    workPressure: number;
    used: number;
    duration: number;
}

export interface NdlViewState extends ViewState {
    fO2: number;
    pO2: number;
    altitude: number;
    salinity: Salinity;
    gfLow: number;
    gfHigh: number;
}

/** all data are stored in metric */
export interface ViewState {
    /** case sensitive id as view key */
    id: string;
}

/** Only for url serialization */
export interface AppPreferencesDto {
    options: AppOptionsDto;
    dives: DiveDto[];
}

export interface DiveDto {
    options: OptionsDto;
    diver: DiverDto;
    tanks: TankDto[];
    plan: SegmentDto[];
}

/**
 * Send these in url, because screen without them
 * may cause different/unexpected rounding and value ranges
 **/
export interface AppOptionsDto {
    imperialUnits: boolean;
    isComplex: boolean;
    language: string;
}

/**
 *  We can't us TankBound from models directly,
 *  because it will cause unresolved dependency in background tasks
 **/
export interface ITankBound {
    id: number;
    /** in bars to avoid conversions */
    workingPressureBars: number;
    tank: Tank;
}

export interface ProfileRequestDto {
    tanks: TankDto[];
    plan: SegmentDto[];
    options: OptionsDto;
    eventOptions: EventOptionsDto;
}

export interface EventOptionsDto {
    maxDensity: number;
}

export interface DiveInfoResultDto {
    noDeco: number;
    otu: number;
    cns: number;
    density: DensityDto;
}

export interface DensityDto {
    gas: GasDto;
    depth: number;
    density: number;
}

export interface ProfileResultDto {
    profile: CalculatedProfileDto;
    events: EventDto[];
}

export interface EventDto {
    timeStamp: number;
    depth: number;
    type: EventType;
    message?: string;
    gas?: GasDto;
}

export interface CalculatedProfileDto {
    segments: SegmentDto[];
    ceilings: Ceiling[];
    errors: EventDto[];
}

export interface ConsumptionRequestDto {
    plan: SegmentDto[];
    profile: SegmentDto[];
    options: OptionsDto;
    diver: DiverDto;
    tanks: TankDto[];
}

export interface ConsumedDto {
    /** Tank id */
    id: number;
    consumed: number;
    reserve: number;
}

export interface ConsumptionResultDto {
    maxTime: number;
    timeToSurface: number;
    tanks: ConsumedDto[];
}

export interface TankDto {
    id: number;
    size: number;
    /** in bars */
    workPressure: number;
    startPressure: number;
    gas: GasDto;
}

export interface SegmentDto {
    startDepth: number;
    endDepth: number;
    duration: number;
    tankId: number;
    gas: GasDto;
}

export interface GasDto {
    fO2: number;
    fHe: number;
}

export interface DiverDto {
    rmv: number;
}

export interface OptionsDto {
    gfLow: number;
    gfHigh: number;
    maxPpO2: number;
    maxDecoPpO2: number;
    salinity: Salinity;
    altitude: number;
    roundStopsToMinutes: boolean;
    gasSwitchDuration: number;
    safetyStop: SafetyStop;
    lastStopDepth: number;
    decoStopDistance: number;
    minimumAutoStopDepth: number;
    maxEND: number;
    oxygenNarcotic: boolean;
    ascentSpeed6m: number;
    ascentSpeed50percTo6m: number;
    ascentSpeed50perc: number;
    descentSpeed: number;
    problemSolvingDuration: number;
}
