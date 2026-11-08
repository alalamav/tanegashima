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

• Círculo — una sola vuelta, así que el muro se cierra sobre sí mismo y forma un anillo en vez de una espiral. El radio es r₀ y r₁ queda desactivado. El ángulo sigue siendo lunar: es la fase recorrida, escalada para que la ventana dé exactamente una vuelta, de modo que una ventana de un mes sinódico ES la fase de la luna, con luna nueva en la junta.
• Cilindro — la forma de revolución, y el único modo que no es un enrollado. El ángulo es la fase lunar como en el modo sinódico, pero manda la ALTURA: la pieza sube «subida por vuelta» cada lunación, así que un mes sinódico es una tajada fija del eje. La marea se convierte en el RADIO, medido desde r₀, y lo que sale es un torneado: cada cresta es un círculo completo del mismo diámetro por todos lados, lo que hace una terraja contra el torno. La pendiente de la silueta es lo que hay que vigilar.
• Sinódico — ángulo = fase lunar sin envolver. Una vuelta = un mes sinódico (~29,5 días). Lunas nuevas a 0°, llenas a 180°. Las vueltas las fija la ventana, no usted: ahora ${n(measures.turns, 2)}.
• Sicigias — ángulo = 2 × fase. Luna nueva y llena caen las dos a 0°, así que las dos mareas vivas del mes coinciden en dirección. Da el doble de vueltas y el doble de muro.
• Lineal — ángulo uniforme en el tiempo, con las vueltas puestas a mano. No alinea nada: es la versión de control contra la que se compara.

${
      params.clockMode === 'cylinder'
        ? `Ahora la pieza mide ${n(measures.totalHeightMm, 0)} mm de alto por ${n(measures.firedOuterDiameterMm, 0)} mm en su punto más ancho, y cada ciclo de marea ocupa ${n(measures.tideWavelengthMm)} mm de perfil. Los números por defecto dejan verdes todos los demás modos, así que cambiar de modo es cambiar de forma, no estrellarse.`
        : params.clockMode === 'circle'
          ? `Ahora el anillo mide ${n(measures.centerlineLengthMm, 0)} mm de contorno. Los modos en espiral plana necesitan un r₀ mucho más pequeño que este: al cambiar de modo saltarán comprobaciones, cada una con su botón de arreglo.`
          : `Con los radios y la ventana de ahora caben entre ${n(guidance.minTurns, 2)} y ${n(guidance.maxTurns, 2)} vueltas. Si un modo se sale de ese rango, ensanche r₁ − r₀ o acorte la ventana.`
    }`,
    en: `Where each hour's angle comes from. Everything else hangs off this choice.

• Circle — a single turn, so the wall closes on itself into a ring rather than a spiral. The radius is r₀ and r₁ is disabled. The angle is still lunar: it is the elapsed phase, scaled so the window covers exactly one turn, so a window of one synodic month IS the moon's phase, with new moon at the seam.
• Cylinder — the revolved form, and the one mode that is not a coil. The angle is the moon's phase as in synodic mode, but it drives HEIGHT: the piece rises by “rise per turn” each lunation, so one synodic month is a fixed slice of the axis. The tide becomes the RADIUS, measured out from r₀, and what comes out is a thrown form — every crest a full circle of its own diameter, identical on every side, which is what a profile pulled against a turning wheel makes. The silhouette's slope is the thing to watch.
• Synodic — angle = unwrapped moon phase. One turn = one synodic month (~29.5 days). New moons at 0°, full at 180°. The window fixes the turns, not you: ${n(measures.turns, 2)} right now.
• Spring–neap — angle = 2 × phase. New and full moon both land at 0°, so the month's two spring tides share a direction. Twice the turns and twice the wall.
• Linear — angle uniform in time, turns set by hand. It aligns nothing: it is the control version to compare the others against.

${
      params.clockMode === 'cylinder'
        ? `The piece currently stands ${n(measures.totalHeightMm, 0)} mm tall by ${n(measures.firedOuterDiameterMm, 0)} mm at its widest, and each tidal cycle takes ${n(measures.tideWavelengthMm)} mm of profile. The default numbers leave every other mode green too, so changing mode is a change of form rather than a wall of red.`
        : params.clockMode === 'circle'
          ? `The ring currently measures ${n(measures.centerlineLengthMm, 0)} mm around. The flat spiral modes need a far smaller r₀ than this: switching will raise checks, each with its own fix button.`
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
    es: 'Siete días, del 4 al 10 de octubre de 1999: las dos erupciones subplinianas, la del 5 y la del 7, con dos días de margen a cada lado. Es la ventana para la que está pensada la pieza, y ni una hora de ese tramo está reconstruida. En la forma de revolución la ventana es lo que fija la altura, y siete días son más o menos lo que un horno de 400 mm admite con un relieve que se vea.',
    en: 'Seven days, 4–10 October 1999: the two subplinian eruptions, the 5th and the 7th, with two days of margin at each end. This is the window the piece is designed around, and not one hour of it is reconstructed. On the revolved form the window is what sets the height, and seven days is about as much as a 400 mm kiln will take at a relief worth looking at.',
  },
  fullWindow: {
    es: 'Los 97 días del encargo, del 26 de septiembre al 31 de diciembre, con las cinco erupciones. Cambia sólo las fechas, no los radios ni el paso: en la forma de revolución la pieza sale de más de cuatro metros de alto, y en un anillo de este tamaño la marea se vuelve un peine imposible de cortar. La comprobación lo dirá, con su botón. Útil para mirar, no para construir.',
    en: "The brief's 97 days, 26 September to 31 December, with all five eruptions. It changes the dates only, not the radii or the pitch: on the revolved form the piece comes out over four metres tall, and on a ring this size the tide becomes a comb too fine to cut. The check will say so, with its button. Useful for looking, not for building.",
  },

  // --------------------------------------------------------------- spiral
  r0: ({ measures, params, guidance }) =>
    params.clockMode === 'cylinder'
      ? {
          es: `El radio del núcleo, en mm (cocido): la cintura desde la que se mide la marea hacia fuera. No es el punto más ancho de la pieza — la marea sale de aquí — así que el diámetro exterior cocido es ${n(measures.firedOuterDiameterMm, 0)} mm, que son ${n(measures.firedOuterDiameterMm / 2 - params.r0)} mm de relieve sobre r₀. El horno admite hasta r₀ = ${n(guidance.maxOuterRadiusMm - (measures.firedOuterDiameterMm / 2 - params.r0), 0)} mm con este relieve.

Mover r₀ engorda o adelgaza la pieza sin tocar la marea: el relieve y la pendiente del perfil no dependen de él.`,
          en: `The core radius, in mm (fired): the waist the tide is measured out from. It is NOT the widest point of the piece — the tide comes out of it — so the fired outer diameter is ${n(measures.firedOuterDiameterMm, 0)} mm, which is ${n(measures.firedOuterDiameterMm / 2 - params.r0)} mm of relief standing on r₀. The kiln allows up to r₀ = ${n(guidance.maxOuterRadiusMm - (measures.firedOuterDiameterMm / 2 - params.r0), 0)} mm at this relief.

Moving r₀ makes the piece fatter or thinner without touching the tide: the relief and the profile's slope do not depend on it.`,
        }
      : params.clockMode === 'circle'
      ? {
          es: `El radio del anillo, en mm (tamaño cocido). Es lo único que fija el tamaño en modo círculo: contorno ${n(measures.centerlineLengthMm, 0)} mm, diámetro exterior cocido ${n(measures.firedOuterDiameterMm, 0)} mm. El horno admite hasta r₀ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
          en: `The radius of the ring, in mm (fired size). In circle mode it is the only thing that sets the size: ${n(measures.centerlineLengthMm, 0)} mm around, ${n(measures.firedOuterDiameterMm, 0)} mm fired outer diameter. The kiln allows up to r₀ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
        }
      : {
          es: `Radio al principio de la ventana, en mm (tamaño cocido). Marca lo apretado que queda el centro: con r₀ pequeño las primeras horas se comprimen mucho y un día ocupa poquísimo arco. Diámetro exterior cocido ahora: ${n(measures.firedOuterDiameterMm, 0)} mm.`,
          en: `Radius at the start of the window, in mm (fired size). It sets how tight the middle is: a small r₀ squeezes the first hours hard, and a day occupies very little arc. Fired outer diameter right now: ${n(measures.firedOuterDiameterMm, 0)} mm.`,
        },
  r1: ({ guidance, measures, params }) =>
    params.clockMode === 'circle' || params.clockMode === 'cylinder'
      ? {
          es: 'Desactivado: en este modo todas las vueltas tienen el mismo diámetro, así que el radio lo da r₀ y r₁ no se usa. Cambie el modo de reloj a sinódico, sicigias o lineal para que vuelva a contar.',
          en: 'Disabled: in this mode every turn has the same diameter, so r₀ gives the radius and r₁ is unused. Switch the clock mode to synodic, spring–neap or linear for it to count again.',
        }
      : {
          es: `Radio al final de la ventana, en mm (cocido). r₁ − r₀ es el sitio que hay para repartir las vueltas: ahora ${n(guidance.radialSpanMm, 0)} mm para ${n(measures.turns, 2)} vueltas. El horno admite hasta r₁ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
          en: `Radius at the end of the window, in mm (fired). r₁ − r₀ is the room the turns have to share: ${n(guidance.radialSpanMm, 0)} mm for ${n(measures.turns, 2)} turns right now. The kiln allows up to r₁ = ${n(guidance.maxOuterRadiusMm, 0)} mm.`,
        },
  pitch: ({ params, measures }) =>
    params.clockMode === 'cylinder'
      ? {
          es: `Cuánto sube la pieza en cada vuelta — en cada lunación — en mm. Es la escala vertical de la forma entera: con ${n(measures.turns, 2)} vueltas la pieza llega a ${n(measures.totalHeightMm, 0)} mm de alto, o sea ${n(measures.mmPerHour, 2)} mm por hora.

Es lo único que decide cuánto sitio tiene cada marea por el perfil: ${n(measures.tideWavelengthMm)} mm por ciclo ahora mismo. Súbalo y la silueta se estira y se vuelve más tendida (pendiente ${n(measures.maxSlope, 2)} : 1); bájelo y se aplasta hasta ser un abanico de discos. Acortar la ventana NO cambia nada de esto: acorta la pieza y deja la marea igual.`,
          en: `How far the piece rises each turn — each lunation — in mm. It is the vertical scale of the whole form: at ${n(measures.turns, 2)} turns the piece stands ${n(measures.totalHeightMm, 0)} mm tall, which is ${n(measures.mmPerHour, 2)} mm per hour.

It is the only thing that decides how much room each tide gets up the profile: ${n(measures.tideWavelengthMm)} mm per cycle right now. Raise it and the silhouette stretches out and lies back (slope ${n(measures.maxSlope, 2)} : 1); lower it and the form squashes into a fan of discs. Shortening the window changes none of this: it shortens the piece and leaves the tide exactly as it was.`,
        }
      : {
          es: 'Desactivado: sólo el modo cilindro, la forma de revolución, sube por el eje. En los demás modos el tiempo va por el ángulo y la marea por la altura del muro.',
          en: 'Disabled: only cylinder mode, the revolved form, climbs the axis. In the other modes time runs round the angle and the tide runs up the height of the wall.',
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
  hBase: ({ params }) =>
    params.clockMode === 'cylinder'
      ? {
          es: 'Cuánto sale la pared del radio del núcleo donde la señal está en su mínimo, en mm. Es la cintura de la pieza: nada entra más que esto salvo una muesca. Súbalo si las muescas se comen el relieve.',
          en: 'How far the wall stands out from the core radius where the signal is at its minimum, in mm. It is the waist of the piece: nothing comes in further except a notch. Raise it if the notches are eating the relief.',
        }
      : {
          es: 'Altura del muro donde la señal está en su mínimo, en mm. Es el suelo de la pieza: nada baja de aquí salvo una muesca. Súbalo si las muescas se comen el muro.',
          en: 'Wall height where the signal is at its minimum, in mm. It is the floor of the piece: nothing goes below it except a notch. Raise it if the notches are eating the wall.',
        },
  k: ({ params, measures }) =>
    params.clockMode === 'cylinder'
      ? {
          es: `Cuántos mm de relieve vale cada cm de marea. Con el rango de esta ventana (${n(measures.windowHours / 24, 0)} días), k = ${n(params.k, 2)} saca la marea ${n(measures.wallHeightMaxMm - params.hBase, 0)} mm por encima de h_base, y la pieza va de ${n(2 * (params.r0 + measures.wallHeightMinMm), 0)} a ${n(measures.firedOuterDiameterMm, 0)} mm de diámetro.

Aquí k es media de las dos cosas que fijan la pendiente del perfil: ${n(measures.maxSlope, 2)} : 1 ahora. La otra es la subida por vuelta. Suba k y la silueta se empina; el barro llega a ${n(measures.maxClayMm)} mm en su punto más gordo contra los ${n(params.wallThickness)} mm del muro.`,
          en: `How many mm of relief each cm of tide is worth. Over this window's range (${n(measures.windowHours / 24, 0)} days), k = ${n(params.k, 2)} brings the tide ${n(measures.wallHeightMaxMm - params.hBase, 0)} mm out past h_base, and the piece runs from ${n(2 * (params.r0 + measures.wallHeightMinMm), 0)} to ${n(measures.firedOuterDiameterMm, 0)} mm across.

Here k is one of the two things that set the profile's slope — ${n(measures.maxSlope, 2)} : 1 right now. The other is the rise per turn. Raise k and the silhouette steepens; the clay reaches ${n(measures.maxClayMm)} mm at its thickest against the wall's ${n(params.wallThickness)} mm.`,
        }
      : {
          es: `Cuántos mm de muro vale cada cm de marea. Con el rango de esta ventana (${n(measures.windowHours / 24, 0)} días), k = ${n(params.k, 2)} da una subida de ${n(measures.wallHeightMaxMm - params.hBase, 0)} mm sobre h_base.

Ojo: la marea sube y baja casi todo ese recorrido cada 12,4 h, o sea cada ${n(measures.tideWavelengthMm)} mm de arco. Con k alto la pieza es un peine muy fino; bájelo o suba el suavizado si quiere algo construible a mano.`,
          en: `How many mm of wall each cm of tide is worth. Over this window's range (${n(measures.windowHours / 24, 0)} days), k = ${n(params.k, 2)} gives a rise of ${n(measures.wallHeightMaxMm - params.hBase, 0)} mm above h_base.

Watch out: the tide swings most of that every 12.4 h, which is every ${n(measures.tideWavelengthMm)} mm of arc. A large k makes the piece a very fine comb; lower it or raise the smoothing for something buildable by hand.`,
        },
  smoothing: ({ measures }) => ({
    es: `Media móvil sobre el borde superior, medida en mm de arco (0 la apaga). Quita los detalles más cortos que esta longitud de onda.

Un ciclo de marea mide ahora ${n(measures.tideWavelengthMm)} mm, así que un suavizado por encima de eso borra la marea semidiurna y deja sólo la envolvente de mareas vivas y muertas.`,
    en: `Moving average along the top edge, measured in mm of arc (0 switches it off). It removes detail shorter than this wavelength.

One tidal cycle is ${n(measures.tideWavelengthMm)} mm right now, so smoothing above that erases the semidiurnal tide and leaves only the spring–neap envelope.`,
  }),
  wallThickness: ({ params, measures }) =>
    params.clockMode === 'cylinder'
      ? {
          es: `Grosor nominal de la pared, en mm (cocido). La cara interior no es la exterior desplazada: es la exterior EROSIONADA con un disco de este tamaño, que es lo que hace una mano. Por eso la pared nunca sale más fina que esto y sí más gorda en las crestas cerradas — ${n(measures.maxClayMm)} mm en el punto más gordo ahora mismo.

6 mm es una pared normal de torno. Engordarla cierra el taladro y espesa las crestas; adelgazarla deja seguir siluetas más cerradas.`,
          en: `Nominal wall thickness, in mm (fired). The inner surface is not the outer one offset: it is the outer one ERODED by a disc this size, which is what a hand does. So the wall never comes out thinner than this, and does come out thicker at tight crests — ${n(measures.maxClayMm)} mm at the thickest right now.

6 mm is an ordinary thrown wall. Thickening it closes the bore and fattens the crests; thinning it lets the silhouette turn tighter.`,
        }
      : {
          es: `Grosor de la losa, en mm (cocido). Entra dos veces en las comprobaciones: suma al espacio que cada vuelta necesita (espesor + holgura = ${n(params.wallThickness + params.clearanceMm)} mm) y decide cuánta arcilla hay. 6 mm es una losa normal de taller.`,
          en: `Slab thickness, in mm (fired). It enters the checks twice: it adds to the room each turn needs (thickness + clearance = ${n(params.wallThickness + params.clearanceMm)} mm) and it sets how much clay there is. 6 mm is an ordinary studio slab.`,
        },
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
  maxHeight: ({ params }) =>
    params.clockMode === 'cylinder'
      ? {
          es: 'Relieve máximo aceptable, en mm: cuánto puede sacarse la marea del radio del núcleo. En la forma de revolución no es una losa de pie lo que limita, sino hasta dónde se puede empujar la pared sin que la pieza se vuelva más barro que forma.',
          en: 'Largest acceptable relief, in mm: how far the tide may stand out from the core radius. On the revolved form the limit is not a slab standing up but how far the wall can be pushed before the piece is more clay than form.',
        }
      : {
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
  exportPlanSvg: ({ params }) =>
    params.clockMode === 'cylinder'
      ? {
          es: 'La terraja: el perfil a 1:1 en crudo, con el eje de revolución en el borde izquierdo, el taladro a trazos, las muescas en rojo y las fechas por el eje. Recórtelo en contrachapado o plástico y es la herramienta que hace la pieza. Imprima al 100% y compruebe el cuadrado de 100 mm con una regla.',
          en: 'The rib: the profile at 1:1 green scale, axis of revolution down the left edge, the bore dashed, notches in red and the dates up the axis. Cut it out of ply or sheet plastic and it is the tool that makes the piece. Print at 100% and check the 100 mm square with a ruler.',
        }
      : {
          es: 'Planta a escala 1:1 en crudo: línea central, muros interior y exterior, muescas en rojo, dirección de la luna nueva, marcas cada 7 días y cruz de centro. Imprímala al 100% y compruebe el cuadrado de 100 mm con una regla.',
          en: 'Plan at 1:1 green scale: centerline, inner and outer wall lines, notches in red, the new-moon direction, ticks every 7 days and a centre cross. Print at 100% and check the 100 mm square with a ruler.',
        },
  exportStripsSvg: ({ params }) =>
    params.clockMode === 'cylinder'
      ? {
          es: 'El mismo perfil de la terraja, partido en largos de página con juntas numeradas y solapes de 10 mm: x = altura por el eje, y = radio desde r₀. Útil cuando el perfil no cabe de una pieza.',
          en: 'The rib’s own profile cut into page lengths, with numbered joints and 10 mm overlaps: x = height up the axis, y = radius out from r₀. Useful when the profile will not fit on one piece.',
        }
      : {
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
