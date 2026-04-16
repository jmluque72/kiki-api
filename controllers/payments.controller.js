const mongoose = require('mongoose');
const Payment = require('../shared/models/Payment');
const PaymentConfig = require('../shared/models/PaymentConfig');
const Student = require('../shared/models/Student');
const Grupo = require('../shared/models/Grupo');
const Shared = require('../shared/models/Shared');
const Account = require('../shared/models/Account');

/** Primer mes facturable (1-12) según alta de la institución (Account.createdAt). */
function getBillingStart(account) {
  if (!account?.createdAt) {
    return { year: 2020, month: 1 };
  }
  const d = new Date(account.createdAt);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Cuota mensual (mes 1-12): solo desde el mes/año de alta en adelante. */
function isCuotaExpectedPeriod(y, month, startYear, startMonth) {
  if (y < startYear) return false;
  if (y > startYear) return true;
  return month >= startMonth;
}

/** Matrícula (año calendario): solo desde el año de alta. */
function isMatriculaExpectedYear(y, startYear) {
  return y >= startYear;
}

function canAccessAccount(currentUser, req, accountId) {
  if (currentUser.role?.nombre === 'superadmin') return true;
  if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
    return accountId === req.userInstitution._id.toString();
  }
  return false;
}

function buildProductsMap(paymentConfig) {
  const map = {};
  (paymentConfig?.productos || []).forEach((product) => {
    if (product && product._id) {
      map[String(product._id)] = {
        _id: String(product._id),
        nombre: product.nombre || '',
        precio: Number(product.precio) || 0,
        activo: product.activo !== false
      };
    }
  });
  return map;
}

const MESES_STATS = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function firstBillingMonthForYear(y, startYear, startMonth) {
  return y > startYear ? 1 : startMonth;
}

function monthKeyStats(y, m) {
  return `${y}-${m}`;
}

/** @returns {{ y: number, m: number }[]} */
function buildMonthsInRange(rangeMode, yearFromQuery) {
  const now = new Date();
  if (rangeMode === 'current_month') {
    return [{ y: now.getFullYear(), m: now.getMonth() + 1 }];
  }
  if (rangeMode === 'three_months') {
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    const out = [];
    for (let delta = 0; delta >= -2; delta -= 1) {
      const d = new Date(cy, cm - 1 + delta, 1);
      out.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
    }
    return out;
  }
  const y = yearFromQuery;
  const months = [];
  for (let m = 1; m <= 12; m += 1) months.push({ y, m });
  return months;
}

function buildPeriodLabel(rangeMode, monthsInRange) {
  if (rangeMode === 'year') return null;
  if (!monthsInRange.length) return null;
  if (rangeMode === 'current_month') {
    const { y, m } = monthsInRange[0];
    return `${MESES_STATS[m] || m} ${y}`;
  }
  const sorted = [...monthsInRange].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.m - b.m));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.y === last.y && first.m === last.m) {
    return `${MESES_STATS[first.m] || first.m} ${first.y}`;
  }
  return `${MESES_STATS[first.m] || first.m} ${first.y} – ${MESES_STATS[last.m] || last.m} ${last.y}`;
}

function normalizeOrigen(origen) {
  const value = String(origen || '').trim().toLowerCase();
  if (!value) return 'sin_origen';
  return value;
}

exports.listPayments = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { year, month, divisionId, studentId } = req.query;
    const currentUser = req.user;

    if (!canAccessAccount(currentUser, req, accountId)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver los pagos de esta cuenta'
      });
    }

    const y = parseInt(year, 10);
    const m = month === '0' || month === 0 ? 0 : parseInt(month, 10);
    if (!y || (m !== 0 && (m < 1 || m > 12)) || y < 2020 || y > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Debe indicar year y month válidos (ej: year=2025, month=3 o month=0 para matrícula)'
      });
    }

    const [paymentConfig, accountDoc] = await Promise.all([
      PaymentConfig.getOrCreateConfig(accountId),
      Account.findById(accountId).select('createdAt').lean()
    ]);
    const { year: startYear, month: startMonth } = getBillingStart(accountDoc);

    const cuotaMap = {};
    (paymentConfig.cuotaPorDivision || []).forEach((item) => {
      cuotaMap[item.division.toString()] = Number(item.monto) || 0;
    });
    const matriculaMap = {};
    (paymentConfig.matriculaPorDivision || []).forEach((item) => {
      matriculaMap[item.division.toString()] = Number(item.monto) || 0;
    });

    const studentQuery = { account: accountId };
    if (divisionId) studentQuery.division = divisionId;
    if (studentId) studentQuery._id = studentId;

    const students = await Student.find(studentQuery)
      .populate('division', 'nombre')
      .lean();
    const productsMap = buildProductsMap(paymentConfig);

    const paymentQuery = { account: accountId, year: y, month: m };
    if (divisionId) paymentQuery.division = divisionId;
    if (studentId) paymentQuery.student = studentId;

    const payments = await Payment.find(paymentQuery).lean();
    const paymentByKey = {};
    payments.forEach((p) => {
      const key = `${p.student}_${p.division}_${p.year}_${p.month}`;
      paymentByKey[key] = p;
    });

    const getAmountExpected = (divId, productId) => {
      if (m === 0) {
        if (!isMatriculaExpectedYear(y, startYear)) return 0;
        return divId ? (matriculaMap[divId] ?? 0) : 0;
      }
      if (!isCuotaExpectedPeriod(y, m, startYear, startMonth)) return 0;
      const assignedProduct = productId ? productsMap[String(productId)] : null;
      if (assignedProduct && assignedProduct.activo) return Number(assignedProduct.precio) || 0;
      return divId ? (cuotaMap[divId] ?? 0) : 0;
    };

    const rows = students.map((st) => {
      const divId = st.division?._id?.toString();
      const assignedProduct = st.paymentProductId ? (productsMap[String(st.paymentProductId)] || null) : null;
      const amountExpected = getAmountExpected(divId, st.paymentProductId);
      const key = `${st._id}_${st.division?._id}_${y}_${m}`;
      const pay = paymentByKey[key] || null;
      return {
        student: {
          _id: st._id,
          nombre: st.nombre,
          apellido: st.apellido,
          paymentProductId: st.paymentProductId || null
        },
        division: st.division ? { _id: st.division._id, nombre: st.division.nombre } : null,
        paymentProduct: assignedProduct ? {
          _id: assignedProduct._id,
          nombre: assignedProduct.nombre,
          precio: assignedProduct.precio
        } : null,
        pricingSource: m === 0 ? 'matricula' : (assignedProduct ? 'producto' : 'division'),
        year: y,
        month: m,
        amountExpected,
        amountPaid: pay ? pay.amountPaid : 0,
        status: pay ? pay.status : 'pendiente',
        paidAt: pay?.paidAt || null,
        notes: pay?.notes || '',
        origen: pay?.origen || null,
        referencia: pay?.referencia || '',
        paymentId: pay?._id || null
      };
    });

    res.json({
      success: true,
      data: {
        payments: rows,
        moneda: paymentConfig.moneda || 'ARS',
        billingStart: { year: startYear, month: startMonth }
      }
    });
  } catch (error) {
    console.error('Error listando pagos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

exports.upsertPayment = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { studentId, divisionId, year, month, amountPaid, paidAt, notes, origen, referencia } = req.body;
    const currentUser = req.user;

    if (!canAccessAccount(currentUser, req, accountId)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar pagos en esta cuenta'
      });
    }

    if (!studentId || !divisionId || year == null || month == null) {
      return res.status(400).json({
        success: false,
        message: 'Faltan studentId, divisionId, year o month'
      });
    }

    const y = parseInt(year, 10);
    const m = month === 0 || month === '0' ? 0 : parseInt(month, 10);
    if (y < 2020 || y > 2100 || (m !== 0 && (m < 1 || m > 12))) {
      return res.status(400).json({
        success: false,
        message: 'year y month inválidos (month=0 para matrícula)'
      });
    }

    const student = await Student.findOne({
      _id: studentId,
      account: accountId,
      division: divisionId
    });
    if (!student) {
      return res.status(400).json({
        success: false,
        message: 'Estudiante no encontrado o no pertenece a esa división/cuenta'
      });
    }

    const division = await Grupo.findOne({ _id: divisionId, cuenta: accountId });
    if (!division) {
      return res.status(400).json({
        success: false,
        message: 'División no encontrada o no pertenece a esta cuenta'
      });
    }

    const [paymentConfig, accountDoc] = await Promise.all([
      PaymentConfig.getOrCreateConfig(accountId),
      Account.findById(accountId).select('createdAt').lean()
    ]);
    const { year: startYear, month: startMonth } = getBillingStart(accountDoc);
    const productsMap = buildProductsMap(paymentConfig);
    const assignedProduct = student.paymentProductId ? (productsMap[String(student.paymentProductId)] || null) : null;
    let amountExpected = 0;
    if (m === 0) {
      if (isMatriculaExpectedYear(y, startYear)) {
        amountExpected = (paymentConfig.matriculaPorDivision || []).find((c) => c.division.toString() === divisionId)?.monto ?? 0;
      }
    } else if (isCuotaExpectedPeriod(y, m, startYear, startMonth)) {
      amountExpected = assignedProduct && assignedProduct.activo
        ? (Number(assignedProduct.precio) || 0)
        : ((paymentConfig.cuotaPorDivision || []).find((c) => c.division.toString() === divisionId)?.monto ?? 0);
    }

    const paid = Math.max(0, Number(amountPaid) || 0);
    let status = 'pendiente';
    if (paid >= amountExpected && amountExpected > 0) status = 'pagado';
    else if (paid > 0) status = 'parcial';

    const paidAtDate = paidAt ? new Date(paidAt) : paid > 0 ? new Date() : null;
    const notesStr = typeof notes === 'string' ? notes.trim().substring(0, 500) : '';
    const origenesValidos = ['efectivo', 'tarjeta', 'banco', 'transferencia', 'cheque', 'otro'];
    const origenStr = origen && origenesValidos.includes(String(origen).toLowerCase())
      ? String(origen).toLowerCase()
      : null;
    const referenciaStr = typeof referencia === 'string' ? referencia.trim().substring(0, 150) : '';

    const payment = await Payment.findOneAndUpdate(
      {
        student: studentId,
        division: divisionId,
        year: y,
        month: m
      },
      {
        account: accountId,
        student: studentId,
        division: divisionId,
        year: y,
        month: m,
        amountExpected,
        amountPaid: paid,
        status,
        paidAt: paidAtDate,
        notes: notesStr,
        origen: origenStr,
        referencia: referenciaStr
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: 'Pago registrado correctamente',
      data: {
        payment: {
          _id: payment._id,
          student: payment.student,
          division: payment.division,
          year: payment.year,
          month: payment.month,
          amountExpected: payment.amountExpected,
          amountPaid: payment.amountPaid,
          status: payment.status,
          paidAt: payment.paidAt,
          notes: payment.notes,
          origen: payment.origen,
          referencia: payment.referencia
        }
      }
    });
  } catch (error) {
    console.error('Error registrando pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

exports.assignStudentPaymentProduct = async (req, res) => {
  try {
    const { accountId, studentId } = req.params;
    const { productId } = req.body;
    const currentUser = req.user;

    if (!canAccessAccount(currentUser, req, accountId)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para asignar productos en esta cuenta'
      });
    }

    const student = await Student.findOne({ _id: studentId, account: accountId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado para esta cuenta'
      });
    }

    if (productId) {
      const paymentConfig = await PaymentConfig.getOrCreateConfig(accountId);
      const productsMap = buildProductsMap(paymentConfig);
      const product = productsMap[String(productId)];
      if (!product || !product.activo) {
        return res.status(400).json({
          success: false,
          message: 'Producto inválido o inactivo'
        });
      }
      student.paymentProductId = String(productId);
    } else {
      student.paymentProductId = null;
    }

    await student.save();

    res.json({
      success: true,
      message: 'Producto asignado correctamente',
      data: {
        studentId: student._id,
        paymentProductId: student.paymentProductId || null
      }
    });
  } catch (error) {
    console.error('Error asignando producto de pago al estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

exports.getPaymentStats = async (req, res) => {
  try {
    const { accountId } = req.params;
    const yearParam = req.query.year;
    const rangeMode = req.query.range === 'current_month' || req.query.range === 'three_months'
      ? req.query.range
      : 'year';
    const currentUser = req.user;

    if (!canAccessAccount(currentUser, req, accountId)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estadísticas de esta cuenta'
      });
    }

    const y = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (rangeMode === 'year' && (y < 2020 || y > 2100)) {
      return res.status(400).json({
        success: false,
        message: 'Año inválido'
      });
    }

    const monthsInRange = buildMonthsInRange(rangeMode, y);
    const rangeKeySet = new Set(monthsInRange.map(({ y: yy, m }) => monthKeyStats(yy, m)));

    const [paymentConfig, accountDoc] = await Promise.all([
      PaymentConfig.getOrCreateConfig(accountId),
      Account.findById(accountId).select('createdAt').lean()
    ]);
    const moneda = paymentConfig.moneda || 'ARS';
    const { year: startYear, month: startMonth } = getBillingStart(accountDoc);

    const cuotaMap = {};
    (paymentConfig.cuotaPorDivision || []).forEach((item) => {
      cuotaMap[item.division.toString()] = Number(item.monto) || 0;
    });

    const students = await Student.find({
      account: accountId,
      division: { $exists: true, $ne: null }
    })
      .select('division paymentProductId')
      .lean();
    const productsMap = buildProductsMap(paymentConfig);

    const porMesObj = {};
    monthsInRange.forEach(({ y: yy, m }) => {
      const k = monthKeyStats(yy, m);
      porMesObj[k] = {
        year: yy,
        month: m,
        esperado: 0,
        cobrado: 0,
        pendiente: 0,
        cantidadPagados: 0,
        cantidadPendientes: 0
      };
    });

    students.forEach((st) => {
      const divId = st.division?.toString?.() || st.division;
      const studentProductId = st.paymentProductId ? String(st.paymentProductId) : null;
      const assignedProduct = studentProductId ? productsMap[studentProductId] : null;
      const cuota = assignedProduct && assignedProduct.activo
        ? (Number(assignedProduct.precio) || 0)
        : (divId ? (cuotaMap[divId] || 0) : 0);
      monthsInRange.forEach(({ y: yy, m }) => {
        if (!isCuotaExpectedPeriod(yy, m, startYear, startMonth)) return;
        const k = monthKeyStats(yy, m);
        if (porMesObj[k]) porMesObj[k].esperado += cuota;
      });
    });

    const matriculaMap = {};
    (paymentConfig.matriculaPorDivision || []).forEach((item) => {
      matriculaMap[item.division.toString()] = Number(item.monto) || 0;
    });

    let matriculaEsperada = 0;
    const yearsInRange = [...new Set(monthsInRange.map((x) => x.y))];
    yearsInRange.forEach((yearY) => {
      if (!isMatriculaExpectedYear(yearY, startYear)) return;
      const firstM = firstBillingMonthForYear(yearY, startYear, startMonth);
      const k = monthKeyStats(yearY, firstM);
      if (!rangeKeySet.has(k)) return;
      let sumMat = 0;
      students.forEach((st) => {
        const divId = st.division?.toString?.() || st.division;
        sumMat += divId ? (matriculaMap[divId] || 0) : 0;
      });
      matriculaEsperada += sumMat;
      if (sumMat > 0 && porMesObj[k]) porMesObj[k].esperado += sumMat;
    });

    let totalEsperado = 0;
    Object.keys(porMesObj).forEach((k) => {
      totalEsperado += porMesObj[k].esperado;
    });

    const yearsNeeded = [...new Set(monthsInRange.map((x) => x.y))];
    const payments = await Payment.find({ account: accountId, year: { $in: yearsNeeded } }).lean();
    let totalCobrado = 0;
    const resumenEstado = { pagado: 0, pendiente: 0, parcial: 0 };
    const resumenOrigenMap = {};

    const addOrigenStats = (payment, amount) => {
      const origenKey = normalizeOrigen(payment.origen);
      if (!resumenOrigenMap[origenKey]) {
        resumenOrigenMap[origenKey] = { origen: origenKey, cantidad: 0, totalCobrado: 0 };
      }
      resumenOrigenMap[origenKey].cantidad += 1;
      resumenOrigenMap[origenKey].totalCobrado += amount;
    };

    payments.forEach((p) => {
      const cobrado = Number(p.amountPaid) || 0;
      const py = p.year;
      if (p.month === 0) {
        const firstM = firstBillingMonthForYear(py, startYear, startMonth);
        if (!isMatriculaExpectedYear(py, startYear)) return;
        if (!rangeKeySet.has(monthKeyStats(py, firstM))) return;
        totalCobrado += cobrado;
        if (p.status === 'pagado') resumenEstado.pagado += 1;
        else if (p.status === 'parcial') resumenEstado.parcial += 1;
        else resumenEstado.pendiente += 1;
        addOrigenStats(p, cobrado);
        const k = monthKeyStats(py, firstM);
        if (porMesObj[k]) {
          porMesObj[k].cobrado += cobrado;
          if (p.status === 'pagado') porMesObj[k].cantidadPagados += 1;
        }
        return;
      }
      if (p.month < 1 || p.month > 12) return;
      if (!isCuotaExpectedPeriod(py, p.month, startYear, startMonth)) return;
      if (!rangeKeySet.has(monthKeyStats(py, p.month))) return;
      totalCobrado += cobrado;
      if (p.status === 'pagado') resumenEstado.pagado += 1;
      else if (p.status === 'parcial') resumenEstado.parcial += 1;
      else resumenEstado.pendiente += 1;
      addOrigenStats(p, cobrado);
      const k = monthKeyStats(py, p.month);
      if (porMesObj[k]) {
        porMesObj[k].cobrado += cobrado;
        if (p.status === 'pagado') porMesObj[k].cantidadPagados += 1;
      }
    });

    const totalAlumnos = students.length;
    Object.keys(porMesObj).forEach((k) => {
      porMesObj[k].pendiente = Math.max(0, porMesObj[k].esperado - porMesObj[k].cobrado);
      porMesObj[k].cantidadPendientes = Math.max(0, totalAlumnos - porMesObj[k].cantidadPagados);
    });
    const totalPendiente = Math.max(0, totalEsperado - totalCobrado);

    const porMesArray = Object.values(porMesObj).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const displayYear = rangeMode === 'year' ? y : new Date().getFullYear();
    const periodLabel = buildPeriodLabel(rangeMode, monthsInRange);
    const resumenOrigen = Object.values(resumenOrigenMap)
      .sort((a, b) => b.totalCobrado - a.totalCobrado);

    res.json({
      success: true,
      data: {
        year: displayYear,
        range: rangeMode,
        periodLabel,
        moneda,
        totalEsperado,
        totalCobrado,
        totalPendiente,
        resumenEstado,
        resumenOrigen,
        porMes: porMesArray,
        matriculaEsperada,
        billingStart: { year: startYear, month: startMonth }
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de pagos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};
