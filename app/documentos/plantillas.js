// Catálogo de documentos del sistema.
//
// Cada documento se declara como datos —sus secciones, sus campos, lo que
// declara quien firma— y una sola vista los pinta a todos. Añadir un formato
// nuevo es añadir un objeto a esta lista, no escribir otra pantalla.
//
// Sobre el contenido: los textos fijos son compromisos que adopta la propia
// empresa, redactados para que sirvan tal cual. Las referencias normativas se
// limitan a las que aplican con certeza a cualquier sociedad colombiana
// (Ley 1581 de 2012 sobre datos personales, Decreto 830 de 2021 sobre PEP, y
// el reporte a la UIAF). La norma concreta que vigila a esta escuela se
// escribe en Ajustes → marco normativo y se imprime en el pie de cada
// documento: inventarla aquí pondría una cita falsa en un papel que va a
// firmar un tercero.

export const GRUPOS = {
  contraparte: 'Conocimiento de la contraparte',
  operaciones: 'Operaciones y reportes',
  gobierno: 'Gobierno del sistema',
};

const TIPOS_DOCUMENTO = [
  'Cédula de ciudadanía',
  'Cédula de extranjería',
  'Pasaporte',
  'NIT',
  'Otro',
];

/** Campos de identificación que repiten casi todos los formatos. */
function identificacionPersona() {
  return [
    { id: 'nombre', etiqueta: 'Nombres y apellidos completos', tipo: 'texto', ancho: 'completo', requerido: true },
    { id: 'tipoDocumento', etiqueta: 'Tipo de documento', tipo: 'select', opciones: TIPOS_DOCUMENTO },
    { id: 'documento', etiqueta: 'Número de documento', tipo: 'texto', requerido: true },
    { id: 'expedidoEn', etiqueta: 'Lugar de expedición', tipo: 'texto' },
    { id: 'nacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha' },
    { id: 'nacionalidad', etiqueta: 'Nacionalidad', tipo: 'texto' },
    { id: 'direccion', etiqueta: 'Dirección de residencia', tipo: 'texto', ancho: 'completo' },
    { id: 'ciudad', etiqueta: 'Ciudad', tipo: 'texto' },
    { id: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
    { id: 'correo', etiqueta: 'Correo electrónico', tipo: 'texto' },
  ];
}

function identificacionEmpresa() {
  return [
    { id: 'nombre', etiqueta: 'Razón social', tipo: 'texto', ancho: 'completo', requerido: true },
    { id: 'documento', etiqueta: 'NIT', tipo: 'texto', requerido: true },
    { id: 'camaraComercio', etiqueta: 'Cámara de comercio y matrícula', tipo: 'texto' },
    { id: 'constitucion', etiqueta: 'Fecha de constitución', tipo: 'fecha' },
    { id: 'direccion', etiqueta: 'Dirección', tipo: 'texto', ancho: 'completo' },
    { id: 'ciudad', etiqueta: 'Ciudad', tipo: 'texto' },
    { id: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
    { id: 'correo', etiqueta: 'Correo electrónico', tipo: 'texto' },
    { id: 'actividad', etiqueta: 'Actividad económica y código CIIU', tipo: 'texto', ancho: 'completo' },
  ];
}

const FIRMA_CONTRAPARTE = {
  rotulo: 'Firma de la contraparte',
  pie: 'Nombre y documento de quien declara',
};
const FIRMA_RESPONSABLE = {
  rotulo: 'Firma del responsable de cumplimiento',
  pie: 'Nombre, cargo y fecha',
  desdePerfil: true,
};

export const PLANTILLAS = [
  /* ---------------- Conocimiento de la contraparte ---------------- */
  {
    id: 'conocimiento-natural',
    nombre: 'Conocimiento de contraparte — persona natural',
    grupo: 'contraparte',
    descripcion:
      'Ficha del alumno, empleado o proveedor persona natural. Es la base del expediente: sin ella no hay a quién consultar ni contra qué contrastar una coincidencia.',
    porContraparte: 'persona',
    secciones: [
      { titulo: 'Identificación', campos: identificacionPersona() },
      {
        titulo: 'Actividad y recursos',
        campos: [
          { id: 'ocupacion', etiqueta: 'Ocupación, oficio o profesión', tipo: 'texto', ancho: 'completo' },
          { id: 'empresa', etiqueta: 'Empresa donde trabaja', tipo: 'texto' },
          { id: 'ingresos', etiqueta: 'Ingresos mensuales aproximados (COP)', tipo: 'numero' },
          { id: 'otrosIngresos', etiqueta: 'Origen de otros ingresos', tipo: 'texto' },
          {
            id: 'operacionesExtranjeras',
            etiqueta: '¿Realiza operaciones en moneda extranjera?',
            tipo: 'si_no',
          },
          { id: 'detalleExtranjeras', etiqueta: 'Detalle de esas operaciones', tipo: 'area' },
        ],
      },
      {
        titulo: 'Relación con la escuela',
        campos: [
          {
            id: 'vinculo',
            etiqueta: 'Tipo de vínculo',
            tipo: 'select',
            opciones: ['Aspirante / alumno', 'Empleado', 'Proveedor', 'Socio o accionista', 'Otro'],
          },
          { id: 'servicio', etiqueta: 'Servicio o categoría contratada', tipo: 'texto' },
          { id: 'valor', etiqueta: 'Valor de la operación (COP)', tipo: 'numero' },
          {
            id: 'formaPago',
            etiqueta: 'Forma de pago',
            tipo: 'select',
            opciones: ['Efectivo', 'Transferencia', 'Tarjeta débito o crédito', 'Financiación', 'Otra'],
          },
        ],
      },
    ],
    declaraciones: [
      'Declaro que la información consignada en este formato es verídica y que la he suministrado de forma voluntaria.',
      'Me obligo a actualizarla al menos una vez al año o cuando cambie, y a informar cualquier hecho que la modifique.',
      'Autorizo a la empresa a verificar esta información y a consultarla en las listas restrictivas y en las bases de datos de acceso público que considere pertinentes.',
    ],
    firmas: [FIRMA_CONTRAPARTE, FIRMA_RESPONSABLE],
  },

  {
    id: 'conocimiento-juridica',
    nombre: 'Conocimiento de contraparte — persona jurídica',
    grupo: 'contraparte',
    descripcion:
      'Ficha de la empresa proveedora o cliente. Incluye los socios con participación igual o superior al 5%, que es a quienes también hay que consultar.',
    porContraparte: 'empresa',
    secciones: [
      { titulo: 'Identificación', campos: identificacionEmpresa() },
      {
        titulo: 'Representante legal',
        campos: [
          { id: 'repNombre', etiqueta: 'Nombres y apellidos', tipo: 'texto', ancho: 'completo' },
          { id: 'repDocumento', etiqueta: 'Documento de identidad', tipo: 'texto' },
          { id: 'repCorreo', etiqueta: 'Correo electrónico', tipo: 'texto' },
        ],
      },
      {
        titulo: 'Composición accionaria',
        nota:
          'Socios, accionistas o beneficiarios finales con participación igual o superior al 5%. Cada uno se consulta por separado en las listas restrictivas.',
        campos: [
          {
            id: 'socios',
            etiqueta: 'Socios y beneficiarios finales',
            tipo: 'tabla',
            columnas: [
              { id: 'nombre', etiqueta: 'Nombre o razón social' },
              { id: 'documento', etiqueta: 'Documento / NIT' },
              { id: 'participacion', etiqueta: '% participación' },
              { id: 'pep', etiqueta: '¿PEP? (sí/no)' },
            ],
            filas: 4,
          },
        ],
      },
      {
        titulo: 'Relación comercial',
        campos: [
          { id: 'objeto', etiqueta: 'Objeto de la relación', tipo: 'area', ancho: 'completo' },
          { id: 'valor', etiqueta: 'Valor estimado anual (COP)', tipo: 'numero' },
          {
            id: 'formaPago',
            etiqueta: 'Forma de pago',
            tipo: 'select',
            opciones: ['Efectivo', 'Transferencia', 'Cheque', 'Otra'],
          },
        ],
      },
    ],
    declaraciones: [
      'Declaro bajo la gravedad de juramento que la información aquí consignada es verídica y que representa legalmente a la sociedad identificada.',
      'Declaro que los recursos de la sociedad provienen de actividades lícitas y que no se han obtenido de las conductas descritas en el Código Penal colombiano ni destinado a su financiación.',
      'Autorizo a la empresa a verificar esta información y a consultar a la sociedad, a su representante legal y a sus socios en las listas restrictivas.',
    ],
    firmas: [
      { rotulo: 'Firma del representante legal', pie: 'Nombre, documento y sello' },
      FIRMA_RESPONSABLE,
    ],
  },

  {
    id: 'pep',
    nombre: 'Declaración de persona expuesta políticamente (PEP)',
    grupo: 'contraparte',
    descripcion:
      'En Colombia no existe un listado oficial de PEP que se pueda descargar y cruzar: la fuente es esta declaración. El Decreto 830 de 2021 extiende la condición a los familiares y a los asociados cercanos.',
    porContraparte: 'persona',
    secciones: [
      {
        titulo: 'Quien declara',
        campos: [
          { id: 'nombre', etiqueta: 'Nombres y apellidos', tipo: 'texto', ancho: 'completo', requerido: true },
          { id: 'tipoDocumento', etiqueta: 'Tipo de documento', tipo: 'select', opciones: TIPOS_DOCUMENTO },
          { id: 'documento', etiqueta: 'Número de documento', tipo: 'texto', requerido: true },
        ],
      },
      {
        titulo: 'Condición declarada',
        campos: [
          {
            id: 'condicion',
            etiqueta: 'Marque lo que corresponda',
            tipo: 'select',
            ancho: 'completo',
            opciones: [
              'No soy PEP ni tengo vínculo con una persona que lo sea',
              'Soy persona expuesta políticamente',
              'Soy cónyuge, compañero permanente o familiar hasta el segundo grado de un PEP',
              'Soy asociado cercano de un PEP',
            ],
          },
          { id: 'cargo', etiqueta: 'Cargo o función pública (si aplica)', tipo: 'texto', ancho: 'completo' },
          { id: 'entidad', etiqueta: 'Entidad', tipo: 'texto' },
          { id: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
          { id: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' },
          {
            id: 'vinculoCon',
            etiqueta: 'Si declara vínculo: nombre, documento y cargo del PEP',
            tipo: 'area',
            ancho: 'completo',
          },
        ],
      },
    ],
    declaraciones: [
      'Declaro bajo la gravedad de juramento que lo aquí manifestado es cierto.',
      'Me comprometo a informar por escrito cualquier cambio en esta condición dentro de los treinta (30) días siguientes a que ocurra, incluida la vinculación a un cargo público o el vínculo con quien lo ocupe.',
      'Entiendo que declarar la condición de PEP no impide la vinculación: activa un seguimiento más estricto por parte de la empresa.',
    ],
    firmas: [FIRMA_CONTRAPARTE],
    nota:
      'Guarde esta declaración incluso cuando la respuesta sea negativa: lo que un auditor revisa es que se haya preguntado, no solo los casos positivos.',
  },

  {
    id: 'origen-fondos',
    nombre: 'Declaración de origen de fondos y de bienes',
    grupo: 'contraparte',
    descripcion:
      'Sustenta de dónde salió el dinero de la operación. Es el documento que se echa de menos cuando alguien paga un curso completo en efectivo.',
    porContraparte: 'ambos',
    secciones: [
      {
        titulo: 'Quien declara',
        campos: [
          { id: 'nombre', etiqueta: 'Nombre o razón social', tipo: 'texto', ancho: 'completo', requerido: true },
          { id: 'tipoDocumento', etiqueta: 'Tipo de documento', tipo: 'select', opciones: TIPOS_DOCUMENTO },
          { id: 'documento', etiqueta: 'Número de documento', tipo: 'texto', requerido: true },
        ],
      },
      {
        titulo: 'La operación',
        campos: [
          { id: 'concepto', etiqueta: 'Concepto', tipo: 'texto', ancho: 'completo' },
          { id: 'valor', etiqueta: 'Valor (COP)', tipo: 'numero' },
          {
            id: 'medio',
            etiqueta: 'Medio de pago',
            tipo: 'select',
            opciones: ['Efectivo', 'Transferencia', 'Tarjeta débito o crédito', 'Cheque', 'Otro'],
          },
          {
            id: 'origen',
            etiqueta: 'Origen de los recursos',
            tipo: 'casillas',
            ancho: 'completo',
            opciones: [
              'Salario o honorarios',
              'Actividad comercial propia',
              'Ahorros',
              'Venta de bienes',
              'Herencia o donación',
              'Crédito',
              'Recursos de un tercero',
              'Otro',
            ],
          },
          { id: 'detalle', etiqueta: 'Explicación del origen', tipo: 'area', ancho: 'completo' },
          {
            id: 'tercero',
            etiqueta: 'Si paga un tercero: nombre, documento y relación',
            tipo: 'area',
            ancho: 'completo',
          },
        ],
      },
    ],
    declaraciones: [
      'Declaro bajo la gravedad de juramento que los recursos con los que pago esta operación provienen de actividades lícitas y que no se relacionan con el lavado de activos, la financiación del terrorismo ni con ninguna de las conductas punibles previstas en el Código Penal colombiano.',
      'Declaro que los recursos no provienen de ninguna actividad ilícita de las contempladas en la ley colombiana, ni han sido destinados a financiarlas.',
      'Autorizo a la empresa a verificar esta declaración y entiendo que la falsedad en ella da lugar a terminar la relación comercial y a los reportes que la ley imponga.',
    ],
    firmas: [FIRMA_CONTRAPARTE, FIRMA_RESPONSABLE],
  },

  {
    id: 'autorizacion-datos',
    nombre: 'Autorización de tratamiento de datos personales',
    grupo: 'contraparte',
    descripcion:
      'Consultar a alguien en listas restrictivas y archivar el resultado es tratar sus datos personales. La Ley 1581 de 2012 exige la autorización previa; sin ella el propio expediente queda mal constituido.',
    porContraparte: 'persona',
    secciones: [
      {
        titulo: 'Titular de los datos',
        campos: [
          { id: 'nombre', etiqueta: 'Nombres y apellidos', tipo: 'texto', ancho: 'completo', requerido: true },
          { id: 'tipoDocumento', etiqueta: 'Tipo de documento', tipo: 'select', opciones: TIPOS_DOCUMENTO },
          { id: 'documento', etiqueta: 'Número de documento', tipo: 'texto', requerido: true },
          { id: 'correo', etiqueta: 'Correo electrónico', tipo: 'texto' },
          { id: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
        ],
      },
      {
        titulo: 'Alcance',
        campos: [
          {
            id: 'finalidades',
            etiqueta: 'Finalidades autorizadas',
            tipo: 'casillas',
            ancho: 'completo',
            opciones: [
              'Verificación en listas restrictivas y bases de acceso público',
              'Cumplimiento de obligaciones de prevención de lavado de activos',
              'Prestación del servicio de enseñanza y trámites ante autoridades de tránsito',
              'Facturación y cobro',
              'Comunicaciones sobre el servicio contratado',
            ],
          },
          {
            id: 'sensibles',
            etiqueta: '¿Autoriza el tratamiento de datos sensibles (salud, biométricos) requeridos por el trámite?',
            tipo: 'si_no',
          },
        ],
      },
    ],
    declaraciones: [
      'Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales para las finalidades marcadas, conforme a la Ley 1581 de 2012 y sus decretos reglamentarios.',
      'Se me informó que como titular tengo derecho a conocer, actualizar y rectificar mis datos, a solicitar prueba de esta autorización, a ser informado sobre el uso que se les da, a presentar quejas ante la Superintendencia de Industria y Comercio y a revocar la autorización o solicitar la supresión de los datos, salvo cuando exista un deber legal de conservarlos.',
      'Entiendo que la información recogida para prevenir el lavado de activos debe conservarse por el término que exija la ley, aun si revoco esta autorización para otras finalidades.',
    ],
    firmas: [{ rotulo: 'Firma del titular', pie: 'Nombre y documento' }],
    nota:
      'La empresa debe tener publicada su política de tratamiento de datos y un canal de atención al titular. Anótelo en Ajustes para que salga impreso al pie.',
  },

  {
    id: 'debida-diligencia',
    nombre: 'Debida diligencia intensificada',
    grupo: 'contraparte',
    descripcion:
      'El documento que cierra una alerta. Se llena cuando una consulta arroja coincidencia, cuando la contraparte es PEP o cuando la operación se sale de lo corriente, y deja escrita la decisión y su sustento.',
    porContraparte: 'ambos',
    secciones: [
      {
        titulo: 'Contraparte y motivo',
        campos: [
          { id: 'nombre', etiqueta: 'Nombre o razón social', tipo: 'texto', ancho: 'completo', requerido: true },
          { id: 'documento', etiqueta: 'Documento / NIT', tipo: 'texto' },
          {
            id: 'motivo',
            etiqueta: 'Motivo de la debida diligencia intensificada',
            tipo: 'casillas',
            ancho: 'completo',
            opciones: [
              'Coincidencia en lista restrictiva',
              'Persona expuesta políticamente o vinculada a una',
              'Operación por cuantía inusual',
              'Pago en efectivo por encima de lo habitual',
              'Pago realizado por un tercero',
              'Información inconsistente o difícil de verificar',
              'Otro',
            ],
          },
          {
            id: 'consultaId',
            etiqueta: 'Identificador de la consulta relacionada',
            tipo: 'texto',
            ancho: 'completo',
            ayuda: 'Se copia del expediente. Enlaza este análisis con la consulta que lo originó.',
          },
        ],
      },
      {
        titulo: 'Verificaciones realizadas',
        campos: [
          {
            id: 'verificaciones',
            etiqueta: 'Qué se verificó',
            tipo: 'casillas',
            ancho: 'completo',
            opciones: [
              'Contraste de número de documento',
              'Contraste de fecha de nacimiento',
              'Contraste de nacionalidad',
              'Consulta en el sitio oficial de la lista',
              'Antecedentes en Procuraduría, Contraloría, Policía y Rama Judicial',
              'Verificación de la actividad económica declarada',
              'Soportes del origen de los recursos',
              'Entrevista con la contraparte',
            ],
          },
          { id: 'hallazgos', etiqueta: 'Hallazgos', tipo: 'area', ancho: 'completo' },
        ],
      },
      {
        titulo: 'Decisión',
        campos: [
          {
            id: 'decision',
            etiqueta: 'Decisión adoptada',
            tipo: 'select',
            ancho: 'completo',
            opciones: [
              'Descartada: se trata de un homónimo',
              'Se vincula con seguimiento reforzado',
              'No se vincula / se termina la relación',
              'Se reporta a la UIAF como operación sospechosa',
            ],
          },
          { id: 'sustento', etiqueta: 'Sustento de la decisión', tipo: 'area', ancho: 'completo', requerido: true },
          { id: 'seguimiento', etiqueta: 'Medidas de seguimiento y periodicidad', tipo: 'area', ancho: 'completo' },
        ],
      },
    ],
    firmas: [FIRMA_RESPONSABLE],
    nota:
      'Este documento es la respuesta a la pregunta que hace todo auditor ante una alerta: «¿y qué hicieron con esto?».',
  },

  /* ---------------- Operaciones y reportes ---------------- */
  {
    id: 'operacion-inusual',
    nombre: 'Análisis de operación inusual',
    grupo: 'operaciones',
    descripcion:
      'Registro de una operación que se sale de lo habitual. Analizarla y descartarla también se documenta: es la prueba de que el sistema funciona y no solo de que hubo un reporte.',
    porContraparte: 'ambos',
    secciones: [
      {
        titulo: 'La operación',
        campos: [
          { id: 'nombre', etiqueta: 'Contraparte', tipo: 'texto', ancho: 'completo', requerido: true },
          { id: 'documento', etiqueta: 'Documento / NIT', tipo: 'texto' },
          { id: 'fechaOperacion', etiqueta: 'Fecha de la operación', tipo: 'fecha' },
          { id: 'valor', etiqueta: 'Valor (COP)', tipo: 'numero' },
          { id: 'descripcion', etiqueta: 'Descripción de la operación', tipo: 'area', ancho: 'completo', requerido: true },
          {
            id: 'senales',
            etiqueta: 'Señales de alerta detectadas',
            tipo: 'casillas',
            ancho: 'completo',
            opciones: [
              'Cuantía desproporcionada frente al perfil declarado',
              'Fraccionamiento de pagos',
              'Pago en efectivo inusual',
              'Pago por un tercero sin relación aparente',
              'Negativa a entregar información',
              'Información falsa o inconsistente',
              'Insistencia en evitar registros o soportes',
              'Coincidencia en listas restrictivas',
              'Otra',
            ],
          },
        ],
      },
      {
        titulo: 'Análisis',
        campos: [
          { id: 'quienDetecto', etiqueta: 'Quién la detectó', tipo: 'texto' },
          { id: 'fechaDeteccion', etiqueta: 'Fecha de detección', tipo: 'fecha' },
          { id: 'analisis', etiqueta: 'Análisis del oficial de cumplimiento', tipo: 'area', ancho: 'completo', requerido: true },
          { id: 'soportes', etiqueta: 'Soportes revisados', tipo: 'area', ancho: 'completo' },
          {
            id: 'conclusion',
            etiqueta: 'Conclusión',
            tipo: 'select',
            ancho: 'completo',
            opciones: [
              'Operación justificada: se archiva sin reporte',
              'Se mantiene en seguimiento',
              'Se determina sospechosa: se reporta a la UIAF',
            ],
          },
        ],
      },
    ],
    firmas: [FIRMA_RESPONSABLE],
  },

  {
    id: 'ros',
    nombre: 'Constancia interna de reporte de operación sospechosa (ROS)',
    grupo: 'operaciones',
    descripcion:
      'Deja constancia interna de un ROS ya presentado. El reporte se transmite a la UIAF por el SIREL: este panel no lo envía ni lo sustituye.',
    porContraparte: 'ambos',
    secciones: [
      {
        titulo: 'Reporte',
        campos: [
          { id: 'radicado', etiqueta: 'Número de radicado en el SIREL', tipo: 'texto' },
          { id: 'fechaReporte', etiqueta: 'Fecha de transmisión', tipo: 'fecha', requerido: true },
          { id: 'nombre', etiqueta: 'Contraparte involucrada', tipo: 'texto', ancho: 'completo' },
          { id: 'documento', etiqueta: 'Documento / NIT', tipo: 'texto' },
          { id: 'valor', etiqueta: 'Valor involucrado (COP)', tipo: 'numero' },
          { id: 'resumen', etiqueta: 'Resumen de lo reportado', tipo: 'area', ancho: 'completo' },
          { id: 'analisisPrevio', etiqueta: 'Documento de análisis que lo sustenta', tipo: 'texto', ancho: 'completo' },
        ],
      },
    ],
    declaraciones: [
      'El reporte de operación sospechosa se presenta de buena fe y no constituye denuncia penal ni genera responsabilidad para quien lo hace.',
      'Este reporte está sujeto a reserva legal: no puede informarse a la persona reportada ni a terceros que se ha presentado.',
    ],
    firmas: [FIRMA_RESPONSABLE],
    obligacion: 'reporte-uiaf',
    nota:
      'Guarde aparte el acuse que devuelve el SIREL. La constancia interna prueba el trámite; el acuse prueba la fecha.',
  },

  {
    id: 'aros',
    nombre: 'Constancia de ausencia de operaciones sospechosas',
    grupo: 'operaciones',
    descripcion:
      'El reporte de ausencia se presenta cuando en el período no hubo nada que reportar. Es fácil de olvidar precisamente porque no pasó nada.',
    secciones: [
      {
        titulo: 'Período',
        campos: [
          { id: 'desde', etiqueta: 'Desde', tipo: 'fecha', requerido: true },
          { id: 'hasta', etiqueta: 'Hasta', tipo: 'fecha', requerido: true },
          { id: 'radicado', etiqueta: 'Radicado del reporte en el SIREL', tipo: 'texto' },
          { id: 'fechaReporte', etiqueta: 'Fecha de transmisión', tipo: 'fecha' },
          { id: 'operacionesRevisadas', etiqueta: 'Operaciones revisadas en el período', tipo: 'numero' },
          { id: 'observaciones', etiqueta: 'Observaciones', tipo: 'area', ancho: 'completo' },
        ],
      },
    ],
    declaraciones: [
      'Durante el período indicado se revisaron las operaciones de la empresa y no se detectaron operaciones sospechosas que ameritaran reporte a la UIAF.',
    ],
    firmas: [FIRMA_RESPONSABLE],
    obligacion: 'reporte-uiaf',
  },

  /* ---------------- Gobierno del sistema ---------------- */
  {
    id: 'designacion-oficial',
    nombre: 'Acta de designación del oficial de cumplimiento',
    grupo: 'gobierno',
    descripcion:
      'Nombra al responsable, con sus funciones y su suplente. Es el primer documento que pide una visita: sin él, nadie responde por el sistema.',
    secciones: [
      {
        titulo: 'Designación',
        campos: [
          { id: 'organo', etiqueta: 'Órgano que designa', tipo: 'texto', ancho: 'completo' },
          { id: 'actaNumero', etiqueta: 'Número de acta', tipo: 'texto' },
          { id: 'fechaDesignacion', etiqueta: 'Fecha de la designación', tipo: 'fecha', requerido: true },
          { id: 'nombre', etiqueta: 'Oficial de cumplimiento designado', tipo: 'texto', ancho: 'completo', requerido: true },
          { id: 'documento', etiqueta: 'Documento de identidad', tipo: 'texto' },
          { id: 'cargo', etiqueta: 'Cargo que ocupa en la empresa', tipo: 'texto' },
          { id: 'suplente', etiqueta: 'Suplente designado', tipo: 'texto', ancho: 'completo' },
          { id: 'documentoSuplente', etiqueta: 'Documento del suplente', tipo: 'texto' },
        ],
      },
      {
        titulo: 'Funciones asignadas',
        campos: [
          {
            id: 'funciones',
            etiqueta: 'Funciones',
            tipo: 'casillas',
            ancho: 'completo',
            opciones: [
              'Velar por el cumplimiento del sistema de prevención de LA/FT',
              'Verificar a las contrapartes contra las listas restrictivas y conservar la evidencia',
              'Analizar las operaciones inusuales y decidir sobre su reporte',
              'Presentar los reportes a la UIAF dentro de los plazos',
              'Capacitar al personal y dejar constancia',
              'Mantener actualizado el manual y la matriz de riesgo',
              'Informar periódicamente a la administración',
              'Conservar los soportes durante el término legal',
            ],
          },
          { id: 'otrasFunciones', etiqueta: 'Otras funciones', tipo: 'area', ancho: 'completo' },
        ],
      },
    ],
    declaraciones: [
      'La persona designada acepta el cargo, manifiesta conocer las funciones asignadas y contará con la autonomía y los recursos necesarios para ejercerlas.',
    ],
    firmas: [
      { rotulo: 'Firma de quien designa', pie: 'Representante legal' },
      { rotulo: 'Aceptación del oficial de cumplimiento', pie: 'Nombre y documento' },
    ],
  },

  {
    id: 'capacitacion',
    nombre: 'Acta de capacitación',
    grupo: 'gobierno',
    descripcion:
      'La capacitación no documentada no existe para efectos de una visita. Esta acta lleva la lista de asistentes con su firma.',
    secciones: [
      {
        titulo: 'La sesión',
        campos: [
          { id: 'fechaSesion', etiqueta: 'Fecha', tipo: 'fecha', requerido: true },
          { id: 'duracion', etiqueta: 'Duración (horas)', tipo: 'numero' },
          { id: 'modalidad', etiqueta: 'Modalidad', tipo: 'select', opciones: ['Presencial', 'Virtual', 'Mixta'] },
          { id: 'capacitador', etiqueta: 'Quién dictó la capacitación', tipo: 'texto', ancho: 'completo' },
          {
            id: 'temas',
            etiqueta: 'Temas tratados',
            tipo: 'casillas',
            ancho: 'completo',
            opciones: [
              'Qué son el lavado de activos y la financiación del terrorismo',
              'Obligaciones de la empresa y del empleado',
              'Conocimiento de la contraparte y documentación exigida',
              'Señales de alerta propias del negocio',
              'Consulta en listas restrictivas y uso del panel',
              'Qué hacer ante una operación inusual y reserva del reporte',
              'Consecuencias del incumplimiento',
            ],
          },
          { id: 'otrosTemas', etiqueta: 'Otros temas', tipo: 'area', ancho: 'completo' },
          {
            id: 'evaluacion',
            etiqueta: '¿Se aplicó evaluación?',
            tipo: 'si_no',
          },
        ],
      },
      {
        titulo: 'Asistentes',
        campos: [
          {
            id: 'asistentes',
            etiqueta: 'Lista de asistencia',
            tipo: 'tabla',
            columnas: [
              { id: 'nombre', etiqueta: 'Nombre' },
              { id: 'documento', etiqueta: 'Documento' },
              { id: 'cargo', etiqueta: 'Cargo' },
              { id: 'firma', etiqueta: 'Firma' },
            ],
            filas: 8,
          },
        ],
      },
    ],
    firmas: [FIRMA_RESPONSABLE],
    obligacion: 'capacitacion',
  },

  {
    id: 'informe-oficial',
    nombre: 'Informe del oficial de cumplimiento',
    grupo: 'gobierno',
    descripcion:
      'Informe periódico a la administración. Los números salen del expediente: el panel los propone al crear el documento y se pueden ajustar.',
    secciones: [
      {
        titulo: 'Período',
        campos: [
          { id: 'desde', etiqueta: 'Desde', tipo: 'fecha', requerido: true },
          { id: 'hasta', etiqueta: 'Hasta', tipo: 'fecha', requerido: true },
          { id: 'dirigidoA', etiqueta: 'Dirigido a', tipo: 'texto', ancho: 'completo' },
        ],
      },
      {
        titulo: 'Cifras del período',
        nota: 'El panel las calcula del expediente al crear el informe. Revíselas antes de firmar.',
        campos: [
          { id: 'totalConsultas', etiqueta: 'Consultas realizadas', tipo: 'numero', calculado: 'consultas' },
          { id: 'totalAlertas', etiqueta: 'Consultas con alerta', tipo: 'numero', calculado: 'alertas' },
          { id: 'totalRevision', etiqueta: 'Consultas en revisión', tipo: 'numero', calculado: 'revision' },
          { id: 'totalPep', etiqueta: 'PEP identificados', tipo: 'numero', calculado: 'pep' },
          { id: 'totalCruces', etiqueta: 'Cruces masivos ejecutados', tipo: 'numero', calculado: 'cruces' },
          { id: 'totalRos', etiqueta: 'ROS presentados', tipo: 'numero' },
        ],
      },
      {
        titulo: 'Contenido',
        campos: [
          { id: 'gestion', etiqueta: 'Gestión del período', tipo: 'area', ancho: 'completo', requerido: true },
          { id: 'alertas', etiqueta: 'Alertas atendidas y su desenlace', tipo: 'area', ancho: 'completo', calculado: 'desenlaces' },
          { id: 'capacitaciones', etiqueta: 'Capacitaciones realizadas', tipo: 'area', ancho: 'completo' },
          { id: 'dificultades', etiqueta: 'Dificultades y recursos requeridos', tipo: 'area', ancho: 'completo' },
          { id: 'recomendaciones', etiqueta: 'Recomendaciones', tipo: 'area', ancho: 'completo' },
        ],
      },
    ],
    firmas: [FIRMA_RESPONSABLE],
  },

  {
    id: 'matriz-riesgo',
    nombre: 'Matriz de riesgo LA/FT',
    grupo: 'gobierno',
    descripcion:
      'Los factores de riesgo del negocio, valorados y con su control. Viene precargada con los riesgos típicos de una escuela de conducción para que solo haya que ajustarla.',
    secciones: [
      {
        titulo: 'Identificación',
        campos: [
          { id: 'version', etiqueta: 'Versión', tipo: 'texto' },
          { id: 'fechaAprobacion', etiqueta: 'Fecha de aprobación', tipo: 'fecha' },
          { id: 'metodologia', etiqueta: 'Metodología de valoración', tipo: 'area', ancho: 'completo' },
        ],
      },
      {
        titulo: 'Factores de riesgo',
        nota: 'Probabilidad e impacto en escala de 1 a 5. El riesgo inherente es el producto de ambos.',
        campos: [
          {
            id: 'factores',
            etiqueta: 'Matriz',
            tipo: 'tabla',
            columnas: [
              { id: 'factor', etiqueta: 'Factor' },
              { id: 'riesgo', etiqueta: 'Riesgo asociado' },
              { id: 'probabilidad', etiqueta: 'Prob. (1-5)' },
              { id: 'impacto', etiqueta: 'Impacto (1-5)' },
              { id: 'control', etiqueta: 'Control aplicado' },
              { id: 'residual', etiqueta: 'Riesgo residual' },
            ],
            filas: 8,
            valorInicial: [
              {
                factor: 'Contrapartes',
                riesgo: 'Vincular a una persona incluida en listas restrictivas',
                probabilidad: '2',
                impacto: '5',
                control: 'Consulta en listas antes de vincular, con certificado archivado',
                residual: 'Bajo',
              },
              {
                factor: 'Contrapartes',
                riesgo: 'Alumno o proveedor que es PEP y no lo declara',
                probabilidad: '2',
                impacto: '3',
                control: 'Declaración PEP firmada y actualización anual',
                residual: 'Bajo',
              },
              {
                factor: 'Productos',
                riesgo: 'Pago del curso completo en efectivo por encima de lo habitual',
                probabilidad: '3',
                impacto: '3',
                control: 'Declaración de origen de fondos y análisis de operación inusual',
                residual: 'Medio',
              },
              {
                factor: 'Productos',
                riesgo: 'Fraccionamiento de pagos para evitar controles',
                probabilidad: '2',
                impacto: '3',
                control: 'Revisión mensual de pagos acumulados por alumno',
                residual: 'Bajo',
              },
              {
                factor: 'Canales',
                riesgo: 'Vinculación por intermediarios sin verificar al beneficiario',
                probabilidad: '2',
                impacto: '4',
                control: 'Identificación de quien paga cuando no es el alumno',
                residual: 'Bajo',
              },
              {
                factor: 'Jurisdicción',
                riesgo: 'Alumnos residentes en zonas de alta actividad ilícita',
                probabilidad: '3',
                impacto: '3',
                control: 'Verificación reforzada de identidad y de residencia',
                residual: 'Medio',
              },
              {
                factor: 'Interno',
                riesgo: 'Personal sin capacitación que no reconoce una señal de alerta',
                probabilidad: '3',
                impacto: '4',
                control: 'Capacitación anual documentada y canal interno de reporte',
                residual: 'Medio',
              },
            ],
          },
        ],
      },
    ],
    firmas: [FIRMA_RESPONSABLE],
  },

  {
    id: 'manual',
    nombre: 'Manual del sistema de prevención LA/FT',
    grupo: 'gobierno',
    descripcion:
      'El documento marco. Viene con un texto base ajustado a una escuela de conducción; edítelo, apruébelo y revíselo una vez al año.',
    secciones: [
      {
        titulo: 'Control de versiones',
        campos: [
          { id: 'version', etiqueta: 'Versión', tipo: 'texto' },
          { id: 'fechaAprobacion', etiqueta: 'Fecha de aprobación', tipo: 'fecha' },
          { id: 'aprobadoPor', etiqueta: 'Aprobado por', tipo: 'texto' },
          { id: 'proximaRevision', etiqueta: 'Próxima revisión', tipo: 'fecha' },
        ],
      },
      {
        titulo: 'Contenido',
        campos: [
          {
            id: 'objetivo',
            etiqueta: '1. Objetivo y alcance',
            tipo: 'area',
            ancho: 'completo',
            alto: 5,
            valorInicial:
              'Este manual establece las políticas y los procedimientos que la empresa aplica para prevenir que sus operaciones se usen para lavar activos o financiar el terrorismo. Aplica a todos los socios, administradores y empleados, y a toda contraparte con la que se establezca una relación: alumnos, empleados, proveedores y aliados.',
          },
          {
            id: 'politica',
            etiqueta: '2. Política',
            tipo: 'area',
            ancho: 'completo',
            alto: 5,
            valorInicial:
              'La empresa no establece ni mantiene relaciones con personas incluidas en listas restrictivas vinculantes para Colombia, ni con quienes se nieguen a acreditar el origen de sus recursos. El cumplimiento de esta política prevalece sobre las metas comerciales: ninguna operación se realiza si no se puede verificar a la contraparte.',
          },
          {
            id: 'conocimiento',
            etiqueta: '3. Conocimiento de la contraparte',
            tipo: 'area',
            ancho: 'completo',
            alto: 6,
            valorInicial:
              'Antes de vincular a una contraparte se diligencia el formato de conocimiento que corresponda, se copia el documento de identidad y se obtiene la autorización de tratamiento de datos personales. La información se actualiza al menos una vez al año. No se vincula a nadie sin este expediente completo.',
          },
          {
            id: 'listas',
            etiqueta: '4. Consulta en listas restrictivas',
            tipo: 'area',
            ancho: 'completo',
            alto: 6,
            valorInicial:
              'Toda contraparte se consulta contra la Lista Consolidada del Consejo de Seguridad de las Naciones Unidas —de aplicación obligatoria en Colombia— y, como práctica de debida diligencia, contra las listas de la OFAC, la Unión Europea y el Reino Unido. La consulta se hace antes de vincular y se repite en un cruce masivo mensual sobre todas las contrapartes activas. De cada consulta se conserva el certificado, que identifica la versión exacta de cada lista utilizada.',
          },
          {
            id: 'pep',
            etiqueta: '5. Personas expuestas políticamente',
            tipo: 'area',
            ancho: 'completo',
            alto: 5,
            valorInicial:
              'Toda contraparte persona natural declara si es persona expuesta políticamente o si tiene vínculo con una, en los términos del Decreto 830 de 2021. La condición de PEP no impide la vinculación: activa una debida diligencia intensificada, la aprobación del oficial de cumplimiento y un seguimiento periódico documentado.',
          },
          {
            id: 'senales',
            etiqueta: '6. Señales de alerta y operaciones inusuales',
            tipo: 'area',
            ancho: 'completo',
            alto: 6,
            valorInicial:
              'Todo empleado que advierta una señal de alerta la informa al oficial de cumplimiento sin comentarla con la contraparte. Son señales de alerta, entre otras: el pago en efectivo por encima de lo habitual, el fraccionamiento de pagos, el pago por un tercero sin relación con el alumno, la negativa a entregar información y la inconsistencia entre la actividad declarada y la operación. Cada caso se documenta en el formato de análisis de operación inusual, se decida o no reportarlo.',
          },
          {
            id: 'reportes',
            etiqueta: '7. Reportes a la UIAF',
            tipo: 'area',
            ancho: 'completo',
            alto: 5,
            valorInicial:
              'El oficial de cumplimiento presenta los reportes que correspondan a la UIAF por el SIREL dentro de los plazos aplicables, incluido el reporte de ausencia de operaciones sospechosas cuando no haya nada que reportar. El reporte está sujeto a reserva legal: no se informa a la persona reportada ni a terceros.',
          },
          {
            id: 'conservacion',
            etiqueta: '8. Conservación de la información',
            tipo: 'area',
            ancho: 'completo',
            alto: 5,
            valorInicial:
              'Los expedientes, las consultas, los certificados y los soportes se conservan por el término que exija la ley, garantizando su integridad y su recuperación. La copia de seguridad del panel se exporta al menos una vez al mes y se guarda en un medio distinto del equipo donde se opera.',
          },
          {
            id: 'capacitacion',
            etiqueta: '9. Capacitación',
            tipo: 'area',
            ancho: 'completo',
            alto: 4,
            valorInicial:
              'Todo el personal recibe capacitación al ingresar y al menos una vez al año, con acta de asistencia firmada. La capacitación cubre las señales de alerta propias del negocio y el procedimiento interno de reporte.',
          },
          {
            id: 'sanciones',
            etiqueta: '10. Consecuencias del incumplimiento',
            tipo: 'area',
            ancho: 'completo',
            alto: 4,
            valorInicial:
              'El incumplimiento de este manual constituye falta grave conforme al reglamento interno de trabajo, sin perjuicio de las responsabilidades legales que correspondan.',
          },
        ],
      },
    ],
    firmas: [
      { rotulo: 'Aprobado por', pie: 'Representante legal' },
      FIRMA_RESPONSABLE,
    ],
    obligacion: 'revision-manual',
    nota:
      'Revise el manual una vez al año y suba la versión aunque no cambie nada: la fecha de revisión es en sí misma una prueba de cumplimiento.',
  },
];

export const POR_ID = new Map(PLANTILLAS.map((p) => [p.id, p]));

/** Valores con los que se abre un documento nuevo. */
export function valoresIniciales(plantilla) {
  const valores = {};
  for (const seccion of plantilla.secciones) {
    for (const campo of seccion.campos) {
      if (campo.valorInicial !== undefined) valores[campo.id] = campo.valorInicial;
      else if (campo.tipo === 'casillas') valores[campo.id] = [];
      else if (campo.tipo === 'tabla') valores[campo.id] = [];
      else valores[campo.id] = '';
    }
  }
  return valores;
}

/** Recorre los campos de una plantilla sin repetir el doble bucle. */
export function* campos(plantilla) {
  for (const seccion of plantilla.secciones) {
    for (const campo of seccion.campos) yield campo;
  }
}

/**
 * Campos obligatorios sin diligenciar.
 *
 * Un documento a medias se puede guardar —se llena en dos sesiones— pero al
 * imprimirlo conviene saber qué le falta, para no hacer firmar un formato con
 * el número de documento en blanco.
 */
export function faltantes(plantilla, valores) {
  const salida = [];
  for (const campo of campos(plantilla)) {
    if (!campo.requerido) continue;
    const valor = valores[campo.id];
    const vacio = Array.isArray(valor) ? valor.length === 0 : !String(valor ?? '').trim();
    if (vacio) salida.push(campo.etiqueta);
  }
  return salida;
}
