import { OptionsDispatcherService } from './options-dispatcher.service';
import { PlannerService } from './planner.service';
import { AppPreferences, DtoSerialization } from './serialization.model';
import { TanksService } from './tanks.service';

export class PreferencesFactory {
    public toPreferences(planner: PlannerService, tanksService: TanksService, targetOptions: OptionsDispatcherService): AppPreferences {
        return {
            isComplex: planner.isComplex,
            options: DtoSerialization.fromOptions(targetOptions.getOptions()),
            diver: DtoSerialization.fromDiver(planner.diver),
            tanks: DtoSerialization.fromTanks(tanksService.tankData),
            plan: DtoSerialization.fromSegments(planner.plan.segments),
        };
    }

    public applyLoaded(target: PlannerService, tanksService: TanksService,
        targetOptions: OptionsDispatcherService, loaded: AppPreferences): void {
        const tanks = DtoSerialization.toTanks(loaded.tanks);
        const segments = DtoSerialization.toSegments(loaded.plan, tanks);
        const diver = DtoSerialization.toDiver(loaded.diver);
        const options = DtoSerialization.toOptions(loaded.options);
        tanksService.loadFrom(tanks);
        targetOptions.loadFrom(options);

        if(!loaded.isComplex) {
            targetOptions.resetToSimple();
            tanksService.resetToSimple();
        }

        target.loadFrom(loaded.isComplex, options, diver, segments);
        target.calculate();
    }
}
