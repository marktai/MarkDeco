import { CanActivateFn, Router, RouterModule, Routes, UrlTree } from '@angular/router';
import { Location } from '@angular/common';
import { AppSettingsComponent } from './app-settings/app-settings.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { SacComponent } from './sac/sac.component';
import { NitroxComponent } from './nitrox/nitrox.component';
import { AboutComponent } from './about/about.component';
import { NdlLimitsComponent } from './ndl-limits/ndl-limits.component';
import { NgModule, inject } from '@angular/core';
import { KnownViews, ViewStates } from './shared/viewStates';
import { AltitudeCalcComponent } from './altitude-calc/altitude-calc.component';
import { WeightCalcComponent } from './weight/weight.component';

const canActivateDashboard: CanActivateFn = (): boolean | UrlTree => {
    const router = inject(Router);
    const viewStates = inject(ViewStates);
    if (viewStates.redirectToView) {
        const target = `/${viewStates.lastView}`;
        const location = inject(Location);
        location.go(target);
        const result = router.parseUrl(target);
        return result;
    }

    return true;
};

const routes: Routes = [
    { path: KnownViews.settings, component: AppSettingsComponent },
    { path: KnownViews.sac, component: SacComponent },
    { path: KnownViews.nitrox, component: NitroxComponent },
    { path: KnownViews.ndl, component: NdlLimitsComponent },
    { path: KnownViews.altitude, component: AltitudeCalcComponent },
    { path: KnownViews.weight, component: WeightCalcComponent },
    { path: KnownViews.about, component: AboutComponent },
    {
        path: '**',
        component: DashboardComponent,
        canActivate: [canActivateDashboard]
    },
];

@NgModule({
    imports: [
        RouterModule.forRoot(routes)
    ],
    exports: [RouterModule],
    declarations: []
})
export class AppRoutingModule { }
