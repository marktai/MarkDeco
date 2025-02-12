class GasMix {
    public static readonly air: GasMix  = new GasMix(21, 0);

    public _fO2: number;
    public _fHe: number;

    constructor(o2: number, he: number = 0) {
        this._fO2 = o2 / 100;
        this._fHe = he / 100;
    }

    public get fO2(): number {
        return this._fO2;
    }

    public get fHe(): number {
        return this._fHe;
    }

    public get fN2(): number {
        return 1 - this.fO2 - this.fHe;
    }

    public get name(): string {
        if (this.fHe > 0) {
            return `TMX ${Math.round(this.fO2 * 100)}/${Math.round(this.fHe * 100)}`;
        } else {
            return this.fO2 === GasMix.air.fO2 ? "AIR" : `EAN${Math.round(this.fO2 * 100)}`;
        }
    }
}

/**
 * Real gas compression calculator.
 * Based on https://github.com/atdotde/realblender
 * Started as original perl script rewrite to typescript.
 */
export class Compressibility {
    private readonly o2Coefficients = [-7.18092073703e-4, 2.81852572808e-6, -1.50290620492e-9];
    private readonly n2Coefficients = [-2.19260353292e-4, 2.92844845532e-6, -2.07613482075e-9];
    private readonly heCoefficients = [4.87320026468e-4, -8.83632921053e-8, 5.33304543646e-11];

    private virial(pressure: number, coefficients: number[]): number {
        return coefficients[0] * pressure +
               coefficients[1] * pressure * pressure +
               coefficients[2] * pressure * pressure * pressure;
    }

    private zFactor(p: number, gas: GasMix): number {
        return (
            1 +
            gas.fO2 * this.virial(p, this.o2Coefficients) +
            gas.fHe * this.virial(p, this.heCoefficients) +
            gas.fN2 * this.virial(p, this.n2Coefficients)
        );
    }

    private normalVolumeFactor(gasPressure: number, gas: GasMix): number {
        return (gasPressure * this.zFactor(1, gas)) / this.zFactor(gasPressure, gas);
    }

    private findP(mix: GasMix, originalV: number): number {
        let p = originalV;
        while (Math.abs(this.zFactor(1, mix) * p - this.zFactor(p, mix) * originalV) > 0.000001) {
            p = (originalV * this.zFactor(p, mix)) / this.zFactor(1, mix);
        }
        return p;
    }

    private format(value: number): string {
        return value.toFixed(1);
    }

    public blend(pi: number, o2i: number, hei: number,
                 pf: number, o2f: number, hef: number,
                 o21: number, he1: number,
                 o22: number, he2: number,
                 o23: number, he3: number): string {

        const gasi = new GasMix(o2i, hei);
        const gas1 = new GasMix(o21, he1);
        const gas2 = new GasMix(o22, he2);
        const gas3 = new GasMix(o23, he3);
        const gasf = new GasMix(o2f, hef);

        if (o2i) {
            if (hef > 0) {
                return this.blendTrimix(pi, pf, gasi, gas1, gas2, gas3, gasf);
            } else {
                return this.blendNitrox(pi, o2i, pf, o2f, o21, o23);
            }
        } else {
            return "Only print the params form.";
        }
    }

    private blendTrimix(pi: number, pf: number, gasi: GasMix, gas1: GasMix, gas2: GasMix, gas3: GasMix, gasf: GasMix): string {
        const det =   gas3.fHe * gas2.fN2 * gas1.fN2
                    - gas2.fHe * gas3.fN2 * gas1.fO2
                    - gas3.fHe * gas1.fN2 * gas2.fO2
                    + gas1.fHe * gas3.fN2 * gas2.fO2
                    + gas2.fHe * gas1.fN2 * gas3.fO2
                    - gas1.fHe * gas2.fN2 * gas3.fO2;

        if (!det) {
            return "Cannot mix with degenerate gases!\n";
        }

        const ivol = this.normalVolumeFactor(pi, gasi);
        const fvol = this.normalVolumeFactor(pf, gasf);

        const top1 = ((gas3.fN2 * gas2.fO2 - gas2.fN2 * gas3.fO2) * (gasf.fHe * fvol - gasi.fHe * ivol)
        + (gas2.fHe * gas3.fO2 - gas3.fHe * gas2.fO2) * (gasf.fN2 * fvol - gasi.fN2 * ivol)
        + (gas3.fHe * gas2.fN2 - gas2.fHe * gas3.fN2) * (gasf.fO2 * fvol - gasi.fO2 * ivol)) / det;

        const top2 = ((gas1.fN2 * gas3.fO2 - gas3.fN2 * gas1.fO2) * (gasf.fHe * fvol - gasi.fHe * ivol)
        + (gas3.fHe * gas1.fO2 - gas1.fHe * gas3.fO2) * (gasf.fN2 * fvol - gasi.fN2 * ivol)
        + (gas1.fHe * gas3.fN2 - gas3.fHe * gas1.fN2) * (gasf.fO2 * fvol - gasi.fO2 * ivol)) / det;

        const top3 = ((gas2.fN2 * gas1.fO2 - gas1.fN2 * gas2.fO2) * (gasf.fHe * fvol - gasi.fHe * ivol)
        + (gas1.fHe * gas2.fO2 - gas2.fHe * gas1.fO2) * (gasf.fN2 * fvol - gasi.fN2 * ivol)
        + (gas2.fHe * gas1.fN2 - gas1.fHe * gas2.fN2) * (gasf.fO2 * fvol - gasi.fO2 * ivol)) / det;

        if (top1 < 0 || top2 < 0 || top3 < 0) {
            return `Impossible to blend ", ${gasf.name}, " with these gases!\n`;
        }

        const newmix1 = new GasMix(100 * (gasi.fO2 * ivol + gas1.fO2 * top1) / (ivol + top1),
        100 * (gasi.fHe * ivol + gas1.fHe * top1) / (ivol + top1));

        const p1 = this.findP(newmix1, ivol + top1);

        const newmix2 = new GasMix(100 * (gasi.fO2 * ivol + gas1.fO2 * top1 + gas2.fO2 * top2) / (ivol + top1 + top2),
        100 * (gasi.fHe * ivol + gas1.fHe * top1 + gas2.fHe * top2) / (ivol + top1 + top2));

        const p2 = this.findP(newmix2, ivol + top1 + top2);


        return `
Start with ${ this.format(pi)} bar of ${ gasi.name }.
Top up with ${gas1.name} up to ${this.format(p1)} bar and end up with ${newmix1.name}.
Then top up with ${gas2.name} up to ${this.format(p2)} bar and end up with ${newmix2.name}.
Finally, top up with ${gas3.name} up to ${this.format(pf)} bar and end up with ${gasf.name}.
Use ${this.format(top1)} litres of ${gas1.name}
${this.format(top2)} litres of ${gas2.name} and
${this.format(top3)} litres of ${gas3.name} per litre of cylinder volume.`;
    }

    private blendNitrox(pi: number, o2i: number,
                        pf: number, o2f: number,
                        o21: number, o23: number): string  {

        const gasi = new GasMix(o2i);
        const gas1 = new GasMix(o21);
        const gas2 = new GasMix(o23);
        const gasf = new GasMix(o2f);

        if (gas1.fO2 === gas2.fO2) {
            return "Cannot mix with identical gases!\n";
        }

        const ivol = this.normalVolumeFactor(pi, gasi);
        const fvol = this.normalVolumeFactor(pf, gasf);

        const top1 = (gas2.fO2 - gasf.fO2) / (gas2.fO2 - gas1.fO2) * fvol
        - (gas2.fO2 - gasi.fO2) / (gas2.fO2 - gas1.fO2) * ivol;
        const top2 = (gas1.fO2 - gasf.fO2) / (gas1.fO2 - gas2.fO2) * fvol
        - (gas1.fO2 - gasi.fO2) / (gas1.fO2 - gas2.fO2) * ivol;

        if (top1 <= 0) {
            return "Impossible to blend with these gases!\n";
        }

        const newmix = new GasMix(100 * (gasi.fO2 * ivol + gas1.fO2 * top1) / (ivol + top1));

        const p1 = this.findP(newmix, ivol + top1);

        return `
Start with ${this.format(pi)} bar of ${ gasi.name}.
Top up with ${gas1.name} up to ${this.format(p1)} bar and end up with ${newmix.name}.
Finally, top up with ${gas2.name} up to ${this.format(pf)} bar and end up with ${gasf.name}.
Use ${this.format(top1)} litres of ${gas1.name} and ${this.format(top2)} litres of ${gas2.name} per litre of cylinder volume.`;
    }
}
