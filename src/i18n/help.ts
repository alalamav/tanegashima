/**
 * What every control does, and what values are worth setting it to.
 *
 * Entries are either a fixed pair of strings or a function of the live
 * configuration, so a tooltip can quote the numbers that apply right now — the
 * acceptable turn range, say, which depends on the radii, the wall thickness and
 * the length of the window.
 */

import type { TurnGuidance } from '../geom/advice.js';
import type { Params } from '../geom/params.js';
import type { Measures } from '../geom/validate.js';
import type { Lang } from './strings.js';

export interface HelpContext {
  params: Params;
  guidance: TurnGuidance;
  measures: Measures;
}

export interface HelpText {
  es: string;
  en: string;
}

export type HelpEntry = HelpText | ((context: HelpContext) => HelpText);

const n = (value: number, decimals = 1): string =>
  Number.isFinite(value) ? value.toFixed(decimals) : '∞';

export const HELP: Record<string, HelpEntry> = {
  // ---------------------------------------------------------------- clock
  clockMode: ({ guidance, measures, params }) => ({
    es: `De dónde sale el ángulo de cada hora. Es la decisión de la que cuelga todo lo demás.

• Círculo — una sola vuelta, así que el muro se cierra sobre sí mismo y forma un cilindro en vez de una espiral. El radio es r₀ y r₁ queda desactivado. El ángulo sigue siendo lunar: es la fase recorrida, escalada para que la ventana dé exactamente una vuelta, de modo que una ventana de un mes sinódico ES la fase de la luna, con luna nueva en la junta.
• Sinódico — ángulo = fase lunar sin envolver. Una vuelta = un mes sinódico (~29,5 días). Lunas nuevas a 0°, llenas a 180°. Las vueltas las fija la ventana, no usted: ahora ${n(measures.turns, 2)}.
• Sicigias — ángulo = 2 × fase. Luna nueva y llena caen las dos a 0°, así que las dos mareas vivas del mes coinciden en dirección. Da el doble de vueltas y el doble de muro.
• Lineal — ángulo uniforme en el tiempo, con las vueltas puestas a mano. No alinea nada: es la versión de control contra la que se compara.

${
      params.clockMode === 'circle'
        ? `Ahora el anillo mide ${n(measures.centerlineLengthMm, 0)} mm de contorno. Los modos en espiral necesitan un r₀ mucho más pequeño que este: al cambiar de modo saltarán comprobaciones, cada una con su botón de arreglo.`
        : `Con los radios y la ventana de ahora caben entre ${n(guidance.minTurns, 2)} y ${n(guidance.maxTurns, 2)} vueltas. Si un modo se sale de ese rango, ensanche r₁ − r₀ o acorte la ventana.`
    }`,
    en: `Where each hour's angle comes from. Everything else hangs off this choice.

• Circle — a single turn, so the wall closes on itself into a cylinder rather than a spiral. The radius is r₀ and r₁ is disabled. The angle is still lunar: it is the elapsed phase, scaled so the window covers exactly one turn, so a window of one synodic month IS the moon's phase, with new moon at the seam.
• Synodic — angle = unwrapped moon phase. One turn = one synodic month (~29.5 days). New moons at 0°, full at 180°. The window fixes the turns, not you: ${n(measures.turns, 2)} right now.
• Spring–neap — angle = 2 × phase. New and full moon both land at 0°, so the month's two spring tides share a direction. Twice the turns and twice the wall.
• Linear — angle uniform in time, turns set by hand. It aligns nothing: it is the control version to compare the others against.

${
      params.clockMode === 'circle'
        ? `The ring currently measures ${n(measures.centerlineLengthMm, 0)} mm around. The spiral modes need a far smaller r₀ than this: switching will raise checks, each with its own fix button.`
        : `At the present radii and window the piece holds between ${n(guidance.minTurns, 2)} and ${n(guidance.maxTurns, 2)} turns. If a mode falls outside that, widen r₁ − r₀ or shorten the window.`
    }`,
  }),

  linearTurns: ({ guidance, params, measures }) =>
    params.clockMode === 'linear'
      ? {
          es: `Cuántas vueltas da la espiral. Sólo cuenta en modo lineal, que es donde usted pone el ángulo.

Rango útil ahora: ${n(guidance.minTurns, 2)} – ${n(guidance.maxTurns, 2)} vueltas. Por debajo, un ciclo de marea se estrecha más que el detalle mínimo; por encima, las vueltas se juntan más que el muro más la holgura.`,
          en: `How many turns the spiral makes. It only counts in linear mode, which is where the angle is yours to set.

Useful range right now: ${n(guidance.minTurns, 2)} – ${n(guidance.maxTurns, 2)} turns. Below that, one tidal cycle gets narrower than the minimum feature; above it, the turns crowd closer than the wall plus its clearance.`,
        }
      : {
          es: `Desactivado: en este modo las vueltas las fija la Luna, no el deslizador. La ventana actual da ${n(measures.turns, 2)} vueltas.

Cambie el modo a «Lineal» para ponerlas a mano, o mueva las fechas de la ventana para cambiarlas en este modo.`,
          en: `Disabled: in this mode the Moon fixes the turns, not the slider. The current window gives ${n(measures.turns, 2)} turns.

Switch the mode to “Linear” to set them by hand, or move the window dates to change them in this mode.`,
        },

  windowStart: {
    es: 'Primera hora que entra en la pieza, en UTC. El registro llega hasta el 1 de septiembre de 1999. La ventana por defecto empieza el 26 de septiembre, el día de la primera erupción magmática.',
    en: "First hour on the piece, in UTC. The record reaches back to 1 September 1999. The default window starts on 26 September, the day of the first magmatic eruption.",
  },
  windowEnd: {
    es: 'Última hora de la pieza. El registro termina el 31 de diciembre de 1999. La ventana tiene que durar al menos 24 h; acortarla es la forma más directa de bajar el metraje de muro.',
    en: 'Last hour on the piece. The record ends on 31 December 1999. The window must span at least 24 h; shortening it is the most direct way to cut the metres of wall.',
  },
  shortWindow: {
    es: 'Doce días, del 1 al 12 de octubre de 1999: las dos erupciones subplinianas, la del 5 y la del 7. Es la ventana para la que está pensada la pieza. Ni una hora de ese tramo está reconstruida, y sobre un anillo de este tamaño cada ciclo de marea mide unos 13 mm en crudo: se puede cortar a mano.',
    en: 'Twelve days, 1–12 October 1999: the two subplinian eruptions, the 5th and the 7th. This is the window the piece is designed around. Not one hour of it is reconstructed, and on a ring this size each tidal cycle is about 13 mm at green size — cuttable by hand.',
  },
  fullWindow: {
    es: 'Los 97 días del encargo, del 26 de septiembre al 31 de diciembre, con las cinco erupciones. Cambia sólo las fechas, no los radios: en un anillo de este tamaño la marea se vuelve un peine imposible de cortar, y la comprobación lo dirá. Útil para mirar, no para construir.',
    en: "The brief's 97 days, 26 September to 31 December, with all five eruptions. It changes the dates only, not the radii: on a ring this size the tide becomes a comb too fine to cut, and the check will say so. Useful for looking, not for building.",
  },

  // --------------------------------------------------------------- spiral
  r0: ({ measures, params, guidance }) =>
    params.clockMode === 'circle'
      ? {
          es: `El radio del anillo, en mm (tamaño cocido). Es lo único que fija el tamaño en modo círculo: contorno ${n(measures.centerlineLengthMm, 0)} mm, diámetro exterior cocido ${n(measures.firedOuterDiameterMm, 0)} mm. El horno admite hasta r₀ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
          en: `The radius of the ring, in mm (fired size). In circle mode it is the only thing that sets the size: ${n(measures.centerlineLengthMm, 0)} mm around, ${n(measures.firedOuterDiameterMm, 0)} mm fired outer diameter. The kiln allows up to r₀ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
        }
      : {
          es: `Radio al principio de la ventana, en mm (tamaño cocido). Marca lo apretado que queda el centro: con r₀ pequeño las primeras horas se comprimen mucho y un día ocupa poquísimo arco. Diámetro exterior cocido ahora: ${n(measures.firedOuterDiameterMm, 0)} mm.`,
          en: `Radius at the start of the window, in mm (fired size). It sets how tight the middle is: a small r₀ squeezes the first hours hard, and a day occupies very little arc. Fired outer diameter right now: ${n(measures.firedOuterDiameterMm, 0)} mm.`,
        },
  r1: ({ guidance, measures, params }) =>
    params.clockMode === 'circle'
      ? {
          es: 'Desactivado: un anillo cerrado no crece hacia fuera, así que el radio lo da r₀ y r₁ no se usa. Cambie el modo de reloj a sinódico, sicigias o lineal para que vuelva a contar.',
          en: 'Disabled: a closed ring does not grow outward, so r₀ gives the radius and r₁ is unused. Switch the clock mode to synodic, spring–neap or linear for it to count again.',
        }
      : {
          es: `Radio al final de la ventana, en mm (cocido). r₁ − r₀ es el sitio que hay para repartir las vueltas: ahora ${n(guidance.radialSpanMm, 0)} mm para ${n(measures.turns, 2)} vueltas. El horno admite hasta r₁ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
          en: `Radius at the end of the window, in mm (fired). r₁ − r₀ is the room the turns have to share: ${n(guidance.radialSpanMm, 0)} mm for ${n(measures.turns, 2)} turns right now. The kiln allows up to r₁ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
        },
  thetaRef: {
    es: 'Gira la planta entera, en grados. No cambia nada de la pieza: sólo decide hacia dónde mira la luna nueva. El valor por defecto, −90°, la pone hacia el espectador.',
    en: 'Rotates the whole plan, in degrees. It changes nothing about the piece: it only decides which way new moon points. The default, −90°, puts it toward the viewer.',
  },
  arcStep: {
    es: 'Cada cuántos mm se toma una muestra de la línea central. 0,5 mm es fino de sobra para la arcilla. Subirlo aligera la malla y la plantilla; bajarlo sólo añade triángulos.',
    en: 'How many mm between samples along the centerline. 0.5 mm is more than fine enough for clay. Raising it lightens the mesh and the template; lowering it only adds triangles.',
  },

  // ----------------------------------------------------------------- wall
  signal: {
    es: `Qué serie levanta el muro.

• elev — elevación del mar sobre el cero de Japón (observado + plano de referencia, −374,5 cm). Lo que de verdad hizo el mar.
• obs — el mismo dato sin desplazar, en cm sobre el plano de referencia. Misma forma, otra etiqueta.
• astro — sólo la marea de la Luna y el Sol (observado − anomalía). Limpia y regular.
• dep — sólo la anomalía: lo que el tiempo meteorológico añadió o quitó. Rango pequeño, así que querrá subir mucho k.`,
    en: `Which series raises the wall.

• elev — sea elevation above Japan's height datum (observed + the observation datum, −374.5 cm). What the sea actually did.
• obs — the same data unshifted, in cm above the observation datum. Same shape, different label.
• astro — the Moon-and-Sun tide alone (observed − anomaly). Clean and regular.
• dep — the anomaly alone: what the weather added or took away. Small range, so you will want a much larger k.`,
  },
  hBase: {
    es: 'Altura del muro donde la señal está en su mínimo, en mm. Es el suelo de la pieza: nada baja de aquí salvo una muesca. Súbalo si las muescas se comen el muro.',
    en: 'Wall height where the signal is at its minimum, in mm. It is the floor of the piece: nothing goes below it except a notch. Raise it if the notches are eating the wall.',
  },
  k: ({ params, measures }) => ({
    es: `Cuántos mm de muro vale cada cm de marea. Con el rango de esta ventana (${n(measures.windowHours / 24, 0)} días), k = ${n(params.k, 2)} da una subida de ${n((measures.wallHeightMaxMm - params.hBase), 0)} mm sobre h_base.

Ojo: la marea sube y baja casi todo ese recorrido cada 12,4 h, o sea cada ${n(measures.tideWavelengthMm)} mm de arco. Con k alto la pieza es un peine muy fino; bájelo o suba el suavizado si quiere algo construible a mano.`,
    en: `How many mm of wall each cm of tide is worth. Over this window's range (${n(measures.windowHours / 24, 0)} days), k = ${n(params.k, 2)} gives a rise of ${n(measures.wallHeightMaxMm - params.hBase, 0)} mm above h_base.

Watch out: the tide swings most of that every 12.4 h, which is every ${n(measures.tideWavelengthMm)} mm of arc. A large k makes the piece a very fine comb; lower it or raise the smoothing for something buildable by hand.`,
  }),
  smoothing: ({ measures }) => ({
    es: `Media móvil sobre el borde superior, medida en mm de arco (0 la apaga). Quita los detalles más cortos que esta longitud de onda.

Un ciclo de marea mide ahora ${n(measures.tideWavelengthMm)} mm, así que un suavizado por encima de eso borra la marea semidiurna y deja sólo la envolvente de mareas vivas y muertas.`,
    en: `Moving average along the top edge, measured in mm of arc (0 switches it off). It removes detail shorter than this wavelength.

One tidal cycle is ${n(measures.tideWavelengthMm)} mm right now, so smoothing above that erases the semidiurnal tide and leaves only the spring–neap envelope.`,
  }),
  wallThickness: ({ params }) => ({
    es: `Grosor de la losa, en mm (cocido). Entra dos veces en las comprobaciones: suma al espacio que cada vuelta necesita (espesor + holgura = ${n(params.wallThickness + params.clearanceMm)} mm) y decide cuánta arcilla hay. 6 mm es una losa normal de taller.`,
    en: `Slab thickness, in mm (fired). It enters the checks twice: it adds to the room each turn needs (thickness + clearance = ${n(params.wallThickness + params.clearanceMm)} mm) and it sets how much clay there is. 6 mm is an ordinary studio slab.`,
  }),
  baseDisc: {
    es: 'Añade un disco de base a la malla exportada, como sólido aparte para que el muro siga siendo hermético. No cambia nada de la espiral ni de las plantillas.',
    en: 'Adds a base disc to the exported mesh, as its own solid so the wall stays watertight. It changes nothing about the spiral or the templates.',
  },

  // -------------------------------------------------------------- notches
  notchWidth: {
    es: 'Ancho del corte de una erupción instantánea, en mm de arco. Sólo afecta a los sucesos con hora conocida: los que se conocen sólo al día ocupan sus 24 h enteras y este valor les sirve de mínimo.',
    en: "Width of an instant eruption's cut, in mm of arc. It only affects events with a known time: day-precision events take up their whole 24 h, and this value is only their minimum.",
  },
  notchDepth0: {
    es: 'Profundidad d₀ de una muesca sin pluma medida, en mm. Los sucesos con pluma empiezan aquí y bajan más; los de día entero cortan d₀ ÷ 2, para que la imprecisión se lea como un corte ancho y poco hondo.',
    en: 'Depth d₀ of a notch with no measured plume, in mm. Events with a plume start here and go deeper; day-precision events cut d₀ ÷ 2, so imprecision reads as a wide shallow cut.',
  },
  notchDepthPerKm: ({ params }) => ({
    es: `Cuánto baja la muesca por cada km de pluma sobre la cima: d = d₀ + k_e · km. Con k_e = ${n(params.notchDepthPerKm, 2)}, la pluma de 15 km del 5 de octubre corta ${n(params.notchDepth0 + params.notchDepthPerKm * 15)} mm.

Si una muesca es más honda que el muro, se deja 1 mm de suelo y la comprobación lo avisa.`,
    en: `How much deeper the notch goes per km of plume above the summit: d = d₀ + k_e · km. At k_e = ${n(params.notchDepthPerKm, 2)}, the 15 km plume of 5 October cuts ${n(params.notchDepth0 + params.notchDepthPerKm * 15)} mm.

If a notch is deeper than the wall is tall, 1 mm of floor is left and the check says so.`,
  }),

  // ---------------------------------------------------- fabrication
  shrinkage: ({ params, measures }) => ({
    es: `Cuánto encoge la arcilla entre crudo y cocido, en %. Todo lo que ve en 3D es tamaño cocido; las plantillas y la malla «en crudo» se multiplican por 1 ÷ (1 − contracción) = ×${(1 / (1 - params.shrinkagePct / 100)).toFixed(4)}.

Diámetro en crudo ahora: ${n(measures.greenOuterDiameterMm, 0)} mm. Mida la contracción de su pasta con una tableta de prueba antes de cortar nada.`,
    en: `How much the clay shrinks between green and fired, in %. Everything in the 3D view is fired size; the templates and the “green” mesh are multiplied by 1 ÷ (1 − shrinkage) = ×${(1 / (1 - params.shrinkagePct / 100)).toFixed(4)}.

Green diameter right now: ${n(measures.greenOuterDiameterMm, 0)} mm. Measure your own body's shrinkage on a test tile before cutting anything.`,
  }),
  kilnLimit: {
    es: 'Diámetro mayor que admite su horno, en mm. Se compara con el tamaño en crudo, no con el cocido, porque la pieza entra al horno antes de encoger.',
    en: 'Largest diameter your kiln will take, in mm. It is compared against the green size, not the fired size, because the piece goes in before it shrinks.',
  },
  clearance: {
    es: 'Hueco que quiere dejar entre una vuelta y la siguiente, aparte del espesor del muro, en mm. Es sitio para los dedos y las herramientas mientras levanta la pieza. 12 mm es cómodo; por debajo de 8 se trabaja mal.',
    en: 'Gap you want between one turn and the next, on top of the wall thickness, in mm. It is room for fingers and tools while building. 12 mm is comfortable; below 8 it gets awkward.',
  },
  minFeature: {
    es: 'El detalle más pequeño que su arcilla aguanta, en mm. Se compara con el arco que ocupa un ciclo de marea: por debajo, la marea deja de leerse y se vuelve textura.',
    en: 'The smallest feature your clay will hold, in mm. It is compared against the arc one tidal cycle occupies: below that, the tide stops reading and turns into texture.',
  },
  maxHeight: {
    es: 'Altura máxima aceptable del muro, en mm. No es una ley física: es hasta dónde una losa de este espesor se queda de pie sin pandearse mientras seca.',
    en: 'Largest acceptable wall height, in mm. Not a physical law: it is how far a slab of this thickness will stand without slumping as it dries.',
  },
  stripMax: {
    es: 'Tira más larga que admite una hoja, en mm de tamaño en crudo. El muro desenrollado se parte en tiras de este largo como mucho, con juntas numeradas y 10 mm de solape.',
    en: 'Longest strip one sheet will take, in mm at green size. The unrolled wall is split into strips no longer than this, with numbered joints and a 10 mm overlap.',
  },
  pageSize: {
    es: 'Tamaño de página del PDF por mosaico. Cada hoja lleva 10 mm de margen, marcas de corte en las esquinas, marcas de registro en los lados y «página n de N».',
    en: 'Page size for the tiled PDF. Each sheet carries a 10 mm margin, corner crop marks, edge registration ticks and “page n of N”.',
  },

  // ----------------------------------------------------------------- view
  viewPlan: {
    es: 'Cámara cenital. Es la vista donde se ve la espiral como espiral, y donde se nota si las erupciones se agrupan hacia un lado.',
    en: 'Camera straight down. This is the view where the spiral reads as a spiral, and where it shows if the eruptions bunch to one side.',
  },
  viewThreeQuarter: {
    es: 'Vista de tres cuartos: la que mejor enseña a la vez la planta y la altura de la marea.',
    en: 'Three-quarter view: the one that shows the plan and the height of the tide at the same time.',
  },
  viewElevation: {
    es: 'Alzado, a la altura del borde. Para juzgar la altura del muro y lo hondo que cortan las muescas.',
    en: 'Elevation, at the height of the edge. For judging the wall height and how deep the notches cut.',
  },
  autoRotate: {
    es: 'Gira despacio la pieza tras 4 s sin tocar nada. Se desactiva solo si el sistema pide movimiento reducido.',
    en: 'Turns the piece slowly after 4 s of no interaction. It switches itself off if the system asks for reduced motion.',
  },
  language: {
    es: 'Cambia toda la interfaz entre español e inglés. También cambia el idioma de las plantillas y de la ficha técnica que exporte.',
    en: 'Switches the whole interface between Spanish and English. It also switches the language of the templates and the spec sheet you export.',
  },

  // -------------------------------------------------------------- exports
  transparentPng: {
    es: 'Exporta el PNG con el fondo transparente en vez del negro de la página.',
    en: 'Exports the PNG with a transparent background instead of the page black.',
  },
  greenMesh: {
    es: 'Exporta la malla a tamaño en crudo en vez de cocido. Para un molde o una plantilla que haya que hacer antes de que la arcilla encoja.',
    en: 'Exports the mesh at green size instead of fired. For a mould or a jig that has to be made before the clay shrinks.',
  },
  exportPng: {
    es: 'Guarda la vista actual tal y como está, al aumento elegido. Los presets de cámara están en «Vista».',
    en: 'Saves the current view exactly as it stands, at the chosen magnification. The camera presets are under “View”.',
  },
  exportStl: {
    es: 'STL binario en mm. Sólido cerrado y hermético, listo para imprimir o para comprobar volumen.',
    en: 'Binary STL in mm. A closed, watertight solid, ready to print or to check the volume of.',
  },
  exportGlb: {
    es: 'GLB en mm, con normales. Para verlo en otro visor o meterlo en una escena.',
    en: 'GLB in mm, with normals. For viewing elsewhere or dropping into another scene.',
  },
  exportPlanSvg: {
    es: 'Planta a escala 1:1 en crudo: línea central, muros interior y exterior, muescas en rojo, dirección de la luna nueva, marcas cada 7 días y cruz de centro. Imprímala al 100% y compruebe el cuadrado de 100 mm con una regla.',
    en: 'Plan at 1:1 green scale: centerline, inner and outer wall lines, notches in red, the new-moon direction, ticks every 7 days and a centre cross. Print at 100% and check the 100 mm square with a ruler.',
  },
  exportStripsSvg: {
    es: 'El muro desenrollado a 1:1: x = longitud de arco, y = altura. Partido en tiras con juntas numeradas y solapes de 10 mm.',
    en: 'The wall unrolled at 1:1: x = arc length, y = height. Split into strips with numbered joints and 10 mm overlaps.',
  },
  exportPdf: {
    es: 'Las dos hojas repartidas en páginas del tamaño elegido, con marcas de corte y de registro. Imprima al 100%, sin «ajustar a la página».',
    en: 'Both sheets laid over pages of the chosen size, with crop and registration marks. Print at 100%, with no “fit to page”.',
  },
  exportSpecJson: {
    es: 'Todos los parámetros, las ecuaciones, las fuentes con sus hashes SHA-256, el plano de referencia, los huecos rellenados y la tabla de erupciones, en JSON.',
    en: 'Every parameter, the equations, the sources with their SHA-256 hashes, the datum, the filled gaps and the eruption table, as JSON.',
  },
  exportSpecPdf: {
    es: 'Lo mismo en una hoja legible: la etiqueta que hace verificable la pieza. Vaya con las plantillas y el render que lleven el mismo hash de configuración.',
    en: 'The same on a readable sheet: the label that makes the piece verifiable. It goes with the templates and the render carrying the same config hash.',
  },

  // --------------------------------------------------------------- panels
  checks: {
    es: 'Comprobaciones de fabricación, recalculadas con cada cambio. Un punto apagado pasa, uno claro avisa, uno rojo falla. Pase el ratón por la ⓘ de cada una para ver qué mide y qué cambiar.',
    en: 'Fabrication checks, recomputed on every change. A dim dot passes, a pale one warns, a red one fails. Hover the ⓘ on each for what it measures and what to change.',
  },
  events: {
    es: 'Las erupciones del Pichincha dentro de la ventana. Pulse una para llevar la cámara a su muesca. Las que quedan fuera de la ventana salen atenuadas y sin muesca.',
    en: "Pichincha's eruptions inside the window. Click one to take the camera to its notch. Events outside the window are dimmed and get no notch.",
  },
  data: {
    es: 'Procedencia de los datos: el plano de referencia usado, cuántas horas hubo que reconstruir y el RMS residual del ajuste armónico con el que se reconstruyeron.',
    en: 'Data provenance: the datum used, how many hours had to be reconstructed, and the residual RMS of the harmonic fit they were reconstructed with.',
  },
};

export function helpText(key: string, context: HelpContext, lang: Lang): string | null {
  const entry = HELP[key];
  if (!entry) return null;
  const resolved = typeof entry === 'function' ? entry(context) : entry;
  return resolved[lang];
}

export function makeHelpContext(params: Params, guidance: TurnGuidance, measures: Measures): HelpContext {
  return { params, guidance, measures };
}
