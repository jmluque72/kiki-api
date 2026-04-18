const fs = require('fs');
const XLSX = require('xlsx');
const DivisionBirthday = require('../shared/models/DivisionBirthday');
const User = require('../shared/models/User');
const Student = require('../shared/models/Student');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');

function normalizeTipo(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'ALUMNO' || s === 'ALUMNA' || s === 'ESTUDIANTE') return 'ALUMNO';
  if (s === 'PADRE' || s === 'MADRE' || s === 'PADRES' || s === 'TUTOR' || s === 'TUTORA') return 'PADRE';
  return null;
}

function parseBirthDate(val) {
  if (val == null || val === '') return null;
   if (typeof val === 'number' && !Number.isNaN(val)) {
    try {
      if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
        const parsed = XLSX.SSF.parse_date_code(val);
        if (parsed && parsed.y) {
          return new Date(parsed.y, (parsed.m || 1) - 1, parsed.d || 1);
        }
      }
    } catch (_) {
      /* ignore */
    }
  }
  const s = String(val).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    return new Date(year, month, day);
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    return new Date(year, month, day);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

async function assertCanManageBirthdays(req, accountId, divisionId) {
  const user = await User.findById(req.user.userId).populate('role');
  if (!user) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }
  const role = user.role?.nombre;

  if (role === 'superadmin') {
    return user;
  }

  if (role === 'adminaccount') {
    if (!req.userInstitution || String(req.userInstitution._id) !== String(accountId)) {
      const err = new Error('No tienes permisos en esta institución');
      err.status = 403;
      throw err;
    }
    return user;
  }

  if (role === 'coordinador') {
    const assoc = await Shared.findOne({
      user: user._id,
      account: accountId,
      status: 'active'
    });
    if (!assoc || String(assoc.division) !== String(divisionId)) {
      const err = new Error('No tienes permisos para esta división');
      err.status = 403;
      throw err;
    }
    return user;
  }

  const err = new Error('Acceso denegado');
  err.status = 403;
  throw err;
}

async function resolveDivisionForMobile(userId) {
  const aa = await ActiveAssociation.findOne({ user: userId })
    .populate('role', 'nombre')
    .populate('account')
    .populate('division')
    .populate('student');

  if (!aa) return null;

  let divisionId = aa.division?._id || aa.division;
  const accountId = aa.account?._id || aa.account;
  const roleName = aa.role?.nombre;

  if (!divisionId && aa.student) {
    const st = await Student.findById(aa.student._id || aa.student).select('division');
    divisionId = st?.division;
  }

  return { aa, accountId, divisionId, roleName };
}

exports.list = async (req, res) => {
  try {
    const { accountId, divisionId } = req.query;
    if (!accountId || !divisionId) {
      return res.status(400).json({ success: false, message: 'accountId y divisionId son requeridos' });
    }

    await assertCanManageBirthdays(req, accountId, divisionId);

    const items = await DivisionBirthday.find({ account: accountId, division: divisionId })
      .populate('student', 'nombre apellido dni')
      .sort({ fechaNacimiento: 1 });

    return res.json({ success: true, data: { birthdays: items } });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('birthdays.list', error);
    return res.status(status).json({ success: false, message: error.message || 'Error interno' });
  }
};

exports.create = async (req, res) => {
  try {
    const { accountId, divisionId, tipo, fechaNacimiento, studentId } = req.body;
    if (!accountId || !divisionId || !studentId || !tipo || !fechaNacimiento) {
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId, studentId, tipo y fechaNacimiento son requeridos'
      });
    }

    const user = await assertCanManageBirthdays(req, accountId, divisionId);
    const tipoNorm = normalizeTipo(tipo);
    if (!tipoNorm) {
      return res.status(400).json({ success: false, message: 'tipo debe ser ALUMNO o PADRE' });
    }

    const fecha = parseBirthDate(fechaNacimiento);
    if (!fecha || Number.isNaN(fecha.getTime())) {
      return res.status(400).json({ success: false, message: 'fechaNacimiento inválida' });
    }

    const st = await Student.findOne({ _id: studentId, account: accountId, division: divisionId });
    if (!st) {
      return res.status(400).json({ success: false, message: 'Alumno no encontrado en esta división' });
    }

    const doc = await DivisionBirthday.create({
      account: accountId,
      division: divisionId,
      student: st._id,
      tipo: tipoNorm,
      fechaNacimiento: fecha,
      createdBy: user._id
    });

    const populated = await DivisionBirthday.findById(doc._id).populate('student', 'nombre apellido dni');
    return res.status(201).json({ success: true, data: { birthday: populated } });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('birthdays.create', error);
    return res.status(status).json({ success: false, message: error.message || 'Error interno' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await DivisionBirthday.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Registro no encontrado' });
    }

    await assertCanManageBirthdays(req, existing.account, existing.division);

    const { tipo, fechaNacimiento, studentId } = req.body;
    if (tipo != null) {
      const tipoNorm = normalizeTipo(tipo);
      if (!tipoNorm) {
        return res.status(400).json({ success: false, message: 'tipo debe ser ALUMNO o PADRE' });
      }
      existing.tipo = tipoNorm;
    }
    if (fechaNacimiento != null) {
      const fecha = parseBirthDate(fechaNacimiento);
      if (!fecha || Number.isNaN(fecha.getTime())) {
        return res.status(400).json({ success: false, message: 'fechaNacimiento inválida' });
      }
      existing.fechaNacimiento = fecha;
    }

    if (studentId !== undefined) {
      if (!studentId) {
        return res.status(400).json({ success: false, message: 'studentId es obligatorio' });
      }
      const st = await Student.findOne({
        _id: studentId,
        account: existing.account,
        division: existing.division
      });
      if (!st) {
        return res.status(400).json({ success: false, message: 'Alumno no encontrado en esta división' });
      }
      existing.student = st._id;
    }

    await existing.save();
    const populated = await DivisionBirthday.findById(existing._id).populate('student', 'nombre apellido dni');
    return res.json({ success: true, data: { birthday: populated } });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('birthdays.update', error);
    return res.status(status).json({ success: false, message: error.message || 'Error interno' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await DivisionBirthday.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Registro no encontrado' });
    }
    await assertCanManageBirthdays(req, existing.account, existing.division);
    await DivisionBirthday.deleteOne({ _id: id });
    return res.json({ success: true, message: 'Eliminado' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('birthdays.remove', error);
    return res.status(status).json({ success: false, message: error.message || 'Error interno' });
  }
};

exports.downloadTemplate = async (req, res) => {
  try {
    const templateData = [
      ['DNI_Alumno', 'Tipo', 'FechaNacimiento'],
      ['40123456', 'ALUMNO', '15/05/2018'],
      ['40123456', 'PADRE', '10/03/1985']
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    worksheet['!cols'] = [{ width: 14 }, { width: 10 }, { width: 18 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cumpleaños');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_cumpleanos.xlsx"');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error) {
    console.error('birthdays.downloadTemplate', error);
    return res.status(500).json({ success: false, message: 'Error generando plantilla' });
  }
};

exports.uploadExcel = async (req, res) => {
  try {
    const { accountId, divisionId } = req.body;
    if (!accountId || !divisionId || !req.file) {
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId y archivo Excel son requeridos'
      });
    }

    const user = await assertCanManageBirthdays(req, accountId, divisionId);

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    const results = { success: 0, errors: [], total: rawData.length };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNumber = i + 2;
      const normalizedRow = {};
      Object.keys(row).forEach((key) => {
        const nk = key.trim().toLowerCase()
          .replace(/\s+/g, '')
          .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
          .replace(/ó/g, 'o').replace(/ú/g, 'u');
        normalizedRow[nk] = row[key];
      });

      const tipoRaw = normalizedRow.tipo || normalizedRow.type;
      const fechaRaw = normalizedRow.fechanacimiento || normalizedRow.fecha || normalizedRow.nacimiento;
      const dniRaw =
        normalizedRow.dnialumno ||
        normalizedRow.dni_alumno ||
        normalizedRow.dni;
      const dni = dniRaw != null ? String(dniRaw).trim() : '';

      if (!dni && !tipoRaw && !fechaRaw) continue;

      const tipoNorm = normalizeTipo(tipoRaw);
      if (!dni || !tipoNorm) {
        results.errors.push({ row: rowNumber, error: 'Faltan DNI del alumno o tipo válido (ALUMNO/PADRE)' });
        continue;
      }

      const fecha = parseBirthDate(fechaRaw);
      if (!fecha || Number.isNaN(fecha.getTime())) {
        results.errors.push({ row: rowNumber, error: 'Fecha de nacimiento inválida' });
        continue;
      }

      const st = await Student.findOne({
        dni,
        account: accountId,
        division: divisionId
      }).select('_id');
      if (!st) {
        results.errors.push({ row: rowNumber, error: `No hay alumno con DNI ${dni} en esta división` });
        continue;
      }

      try {
        await DivisionBirthday.create({
          account: accountId,
          division: divisionId,
          student: st._id,
          tipo: tipoNorm,
          fechaNacimiento: fecha,
          createdBy: user._id
        });
        results.success += 1;
      } catch (e) {
        results.errors.push({ row: rowNumber, error: e.message || 'Error guardando fila' });
      }
    }

    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}

    return res.json({
      success: true,
      message: `Procesadas ${results.success} filas`,
      data: results
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('birthdays.uploadExcel', error);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    return res.status(status).json({ success: false, message: error.message || 'Error interno' });
  }
};

exports.mobileCalendar = async (req, res) => {
  try {
    const userId = req.user.userId;
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const resolved = await resolveDivisionForMobile(userId);
    if (!resolved || !resolved.accountId || !resolved.divisionId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la división activa'
      });
    }

    const { roleName } = resolved;
    if (!['coordinador', 'familyadmin', 'familyviewer'].includes(roleName)) {
      return res.status(403).json({ success: false, message: 'Rol no autorizado' });
    }

    const filter = {
      account: resolved.accountId,
      division: resolved.divisionId
    };
    if (roleName === 'familyadmin' || roleName === 'familyviewer') {
      filter.tipo = 'ALUMNO';
    }

    const items = await DivisionBirthday.find(filter)
      .populate('student', 'nombre apellido dni')
      .lean();

    const inMonth = items
      .filter((e) => {
        const d = new Date(e.fechaNacimiento);
        return d.getMonth() + 1 === month;
      })
      .map((e) => {
        const d = new Date(e.fechaNacimiento);
        const st = e.student;
        const alumnoApellido = st?.apellido || '';
        const alumnoNombre = st?.nombre || '';
        return {
          _id: e._id,
          tipo: e.tipo,
          fechaNacimiento: e.fechaNacimiento,
          dayOfMonth: d.getDate(),
          student: e.student,
          sortApellido: alumnoApellido,
          sortNombre: alumnoNombre
        };
      })
      .sort(
        (a, b) =>
          a.dayOfMonth - b.dayOfMonth ||
          String(a.sortApellido).localeCompare(String(b.sortApellido)) ||
          String(a.sortNombre).localeCompare(String(b.sortNombre))
      )
      .map(({ sortApellido, sortNombre, ...rest }) => rest);

    return res.json({
      success: true,
      data: {
        year,
        month,
        divisionId: resolved.divisionId,
        entries: inMonth
      }
    });
  } catch (error) {
    console.error('birthdays.mobileCalendar', error);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
};
