const Student = require('../shared/models/Student');
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');
const Grupo = require('../shared/models/Grupo');
const Shared = require('../shared/models/Shared');
const Role = require('../shared/models/Role');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const XLSX = require('xlsx');
const fs = require('fs');
const { generateSignedUrl } = require('../config/s3.config');
const { generateRandomPassword } = require('../config/email.config');
const { sendNewUserCreatedEmailToQueue, sendInstitutionAssociationEmailToQueue } = require('../services/sqsEmailService');
const emailService = require('../services/emailService');

// Función auxiliar para crear asociaciones
async function createAssociationByRole(userId, accountId, roleName, divisionId = null, studentId = null, createdBy) {
  try {
    const role = await Role.findOne({ nombre: roleName });
    if (!role) {
      throw new Error(`Rol '${roleName}' no encontrado`);
    }

    const associationData = {
      user: userId,
      account: accountId,
      role: role._id,
      status: 'active',
      createdBy: createdBy
    };

    switch (roleName) {
      case 'adminaccount':
        break;
      case 'coordinador':
        if (divisionId) {
          associationData.division = divisionId;
        }
        break;
      case 'familyadmin':
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
        break;
      default:
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
    }

    const association = new Shared(associationData);
    await association.save();

    const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(userId);
    if (!existingActiveAssociation) {
      try {
        await ActiveAssociation.setActiveAssociation(userId, association._id);
      } catch (error) {
        console.error('Error estableciendo asociación activa:', error);
      }
    }

    return association;
  } catch (error) {
    console.error(`Error creando asociación para rol '${roleName}':`, error);
    throw error;
  }
}

/**
 * Listar estudiantes
 */
exports.listStudents = async (req, res) => {
  try {
    const { accountId, divisionId, year } = req.query;

    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      const { userId } = req.user;
      currentUser = await User.findById(userId).populate('role');
    }

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const query = {};

    if (currentUser.role?.nombre === 'superadmin') {
      if (accountId) query.account = accountId;
      if (divisionId) query.division = divisionId;
    } else if (currentUser.role?.nombre === 'adminaccount') {
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
        if (divisionId) query.division = divisionId;
      } else {
        return res.status(403).json({
          success: false,
          message: 'No tienes una institución asignada'
        });
      }
    } else {
      if (!accountId || !divisionId) {
        return res.status(400).json({
          success: false,
          message: 'accountId y divisionId son requeridos'
        });
      }

      if (!req.user.isCognitoUser) {
        const userAssociation = await Shared.findOne({
          user: currentUser._id,
          account: accountId,
          status: 'active'
        });

        if (!userAssociation) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para acceder a esta institución'
          });
        }
      }

      query.account = accountId;
      query.division = divisionId;
    }

    if (year) {
      query.year = parseInt(year);
    }

    const students = await Student.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .sort({ apellido: 1, nombre: 1 });

    res.json({
      success: true,
      data: {
        students,
        total: students.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener estudiantes por cuenta y división
 */
exports.getStudentsByAccountDivision = async (req, res) => {
  try {
    const { accountId, divisionId, year } = req.query;
    const { userId } = req.user;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId es requerido'
      });
    }

    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta institución'
      });
    }

    const query = {
      account: accountId
    };

    if (divisionId) {
      query.division = divisionId;
    }

    if (year) {
      query.year = parseInt(year);
    }

    const students = await Student.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .sort({ apellido: 1, nombre: 1 });

    const studentsWithAvatarUrls = await Promise.all(students.map(async (student) => {
      const studentObj = student.toObject();
      
      if (student.avatar) {
        try {
          if (student.avatar.includes('students/')) {
            const signedUrl = await generateSignedUrl(student.avatar, 172800);
            studentObj.avatar = signedUrl;
          } else if (!student.avatar.startsWith('http')) {
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${student.avatar.split('/').pop()}`;
            studentObj.avatar = localUrl;
          }
        } catch (error) {
          console.error('Error procesando avatar del estudiante:', student._id, error);
        }
      }
      
      return studentObj;
    }));

    res.json({
      success: true,
      data: {
        students: studentsWithAvatarUrls,
        total: students.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos por cuenta y división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener template de Excel para estudiantes
 */
exports.getStudentsTemplate = async (req, res) => {
  try {
    const templateData = [
      ['Nombre', 'Apellido', 'DNI', 'Nombre Tutor', 'Email Tutor', 'DNI Tutor'],
      ['Juan', 'Pérez', '12345678', 'Carlos Pérez', 'carlos.perez@email.com', '87654321'],
      ['María', 'García', '23456789', 'Ana García', 'ana.garcia@email.com', '76543210'],
      ['Pedro', 'López', '34567890', 'Luis López', 'luis.lopez@email.com', '65432109']
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    worksheet['!cols'] = [
      { width: 15 },
      { width: 15 },
      { width: 12 },
      { width: 15 },
      { width: 25 },
      { width: 12 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estudiantes');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_estudiantes.xlsx"');
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Error generando plantilla de estudiantes:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla de estudiantes'
    });
  }
};

/**
 * Subir estudiantes desde Excel
 */
exports.uploadStudentsExcel = async (req, res) => {
  try {
    console.log('📁 Archivo recibido:', req.file);
    console.log('📋 Body recibido:', req.body);
    
    const { accountId, divisionId, year } = req.body;
    const { userId } = req.user;

    if (!accountId || !divisionId || !year || !req.file) {
      console.log('❌ Datos faltantes:', { accountId, divisionId, year, hasFile: !!req.file });
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId, year y archivo Excel son requeridos'
      });
    }

    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cargar alumnos en esta institución'
      });
    }

    const account = await Account.findById(accountId);
    const division = await Grupo.findById(divisionId);

    if (!account || !division) {
      return res.status(404).json({
        success: false,
        message: 'Institución o división no encontrada'
      });
    }

    console.log('📖 Leyendo archivo Excel:', req.file.path);
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Normalizar nombres de columnas (case-insensitive, sin espacios)
    const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
    console.log('📊 Datos extraídos (raw):', rawData.length, 'filas');
    
    // Normalizar las claves de las filas
    const data = rawData.map((row, index) => {
      const normalizedRow = {};
      Object.keys(row).forEach(key => {
        const normalizedKey = key.trim().toLowerCase()
          .replace(/\s+/g, '')
          .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
          .replace(/ó/g, 'o').replace(/ú/g, 'u');
        normalizedRow[normalizedKey] = row[key];
      });
      
      // Mapear variaciones comunes de nombres de columnas
      const columnMap = {
        'nombre': ['nombre', 'name', 'nombres'],
        'apellido': ['apellido', 'lastname', 'apellidos', 'surname'],
        'dni': ['dni', 'documento', 'document', 'cedula'],
        'email': ['email', 'correo', 'mail'],
        'dnitutor': ['dnitutor', 'dni_tutor', 'dni tutor', 'documentotutor', 'documento_tutor'],
        'nombretutor': ['nombretutor', 'nombre_tutor', 'nombre tutor', 'nametutor', 'name_tutor'],
        'emailtutor': ['emailtutor', 'email_tutor', 'email tutor', 'correotutor', 'correo_tutor']
      };
      
      const finalRow = {};
      Object.keys(columnMap).forEach(targetKey => {
        for (const sourceKey of columnMap[targetKey]) {
          if (normalizedRow[sourceKey] !== undefined && normalizedRow[sourceKey] !== null && normalizedRow[sourceKey] !== '') {
            finalRow[targetKey] = normalizedRow[sourceKey];
            break;
          }
        }
      });
      
      if (index < 3) {
        console.log(`📋 Fila ${index + 2} - Original:`, row);
        console.log(`📋 Fila ${index + 2} - Normalizada:`, finalRow);
      }
      
      return finalRow;
    });
    
    console.log('📊 Datos normalizados:', data.length, 'filas');

    const results = {
      success: 0,
      errors: [],
      total: data.length
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        // Verificar si la fila está vacía usando las claves normalizadas
        const isRowEmpty = !row.nombre && !row.apellido && !row.dni && !row.dnitutor && !row.nombretutor && !row.emailtutor;
        if (isRowEmpty) {
          console.log(`⏭️ Fila ${rowNumber} vacía, saltando`);
          continue;
        }
        
        // Mapear a los nombres esperados por el código
        const mappedRow = {
          nombre: row.nombre,
          apellido: row.apellido,
          dni: row.dni,
          email: row.email,
          dniTutor: row.dnitutor,
          nombreTutor: row.nombretutor,
          emailTutor: row.emailtutor
        };
        
        console.log(`🔄 Procesando fila ${rowNumber}:`, mappedRow);

        if (!mappedRow.nombre || !mappedRow.apellido || !mappedRow.dni) {
          const missingFields = [];
          if (!mappedRow.nombre) missingFields.push('nombre');
          if (!mappedRow.apellido) missingFields.push('apellido');
          if (!mappedRow.dni) missingFields.push('dni');
          
          const errorMsg = `Faltan campos requeridos del alumno: ${missingFields.join(', ')}`;
          console.log(`❌ Fila ${rowNumber}: ${errorMsg}`);
          results.errors.push({
            row: rowNumber,
            error: errorMsg
          });
          continue;
        }

        if (!mappedRow.dniTutor || !mappedRow.nombreTutor || !mappedRow.emailTutor) {
          const missingFields = [];
          if (!mappedRow.dniTutor) missingFields.push('dniTutor');
          if (!mappedRow.nombreTutor) missingFields.push('nombreTutor');
          if (!mappedRow.emailTutor) missingFields.push('emailTutor');
          
          const errorMsg = `Faltan campos requeridos del tutor: ${missingFields.join(', ')}`;
          console.log(`❌ Fila ${rowNumber}: ${errorMsg}`);
          results.errors.push({
            row: rowNumber,
            error: errorMsg
          });
          continue;
        }

        const existingStudent = await Student.findOne({
          dni: String(mappedRow.dni).trim()
        });

        if (existingStudent) {
          const errorMsg = `Alumno ya existe con DNI ${String(mappedRow.dni).trim()}`;
          console.log(`❌ Fila ${rowNumber}: ${errorMsg}`);
          results.errors.push({
            row: rowNumber,
            error: errorMsg
          });
          continue;
        }

        let tutorUser = null;
        const existingTutor = await User.findOne({
          $or: [
            { email: String(mappedRow.emailTutor).toLowerCase().trim() },
            { dni: String(mappedRow.dniTutor).trim() }
          ]
        });

        if (existingTutor) {
          tutorUser = existingTutor;
        } else {
          const tutorRole = await Role.findOne({ nombre: 'familyadmin' });
          if (!tutorRole) {
            results.errors.push({
              row: rowNumber,
              error: 'Rol de tutor no encontrado en el sistema'
            });
            continue;
          }

          const tutorPassword = generateRandomPassword(12);
          const tutorData = {
            name: String(mappedRow.nombreTutor).trim(),
            email: String(mappedRow.emailTutor).toLowerCase().trim(),
            password: tutorPassword,
            role: tutorRole._id,
            status: 'approved',
            dni: String(mappedRow.dniTutor).trim()
          };

          console.log(`👤 Creando tutor para fila ${rowNumber}:`, tutorData.email);
          tutorUser = new User(tutorData);
          await tutorUser.save();
          console.log(`✅ Tutor creado: ${tutorUser._id}`);

          await sendNewUserCreatedEmailToQueue(
            {
              name: tutorUser.name,
              email: tutorUser.email
            },
            tutorData.password,
            account.nombre,
            'Tutor/Padre'
          );
        }

        const studentData = {
          nombre: String(mappedRow.nombre).trim(),
          apellido: String(mappedRow.apellido).trim(),
          dni: String(mappedRow.dni).trim(),
          account: accountId,
          division: divisionId,
          year: parseInt(year),
          tutor: tutorUser._id,
          createdBy: userId
        };
        
        // Agregar email solo si está presente
        if (mappedRow.email && String(mappedRow.email).trim()) {
          const emailValue = String(mappedRow.email).toLowerCase().trim();
          // Validar formato de email
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(emailValue)) {
            studentData.email = emailValue;
          } else {
            console.log(`⚠️ Fila ${rowNumber}: Email inválido, omitiendo: ${emailValue}`);
          }
        }

        console.log(`👨‍🎓 Creando estudiante para fila ${rowNumber}:`, studentData.nombre, studentData.apellido);
        const student = new Student(studentData);
        await student.save();
        console.log(`✅ Estudiante creado: ${student._id}`);

        const existingStudentAssociation = await Shared.findOne({
          user: tutorUser._id,
          account: accountId,
          division: divisionId,
          student: student._id,
          status: 'active'
        });
        
        if (!existingStudentAssociation) {
          await createAssociationByRole(
            tutorUser._id, 
            accountId, 
            'familyadmin', 
            divisionId, 
            student._id, 
            userId
          );

          if (existingTutor) {
            try {
              await sendInstitutionAssociationEmailToQueue(
                {
                  name: tutorUser.name,
                  email: tutorUser.email
                },
                account.nombre,
                division.nombre,
                'Tutor/Padre',
                {
                  nombre: student.nombre,
                  apellido: student.apellido,
                  dni: student.dni
                }
              );
            } catch (emailError) {
              console.error(`Error enviando email de asociación:`, emailError.message);
            }
          }
        }
        
        results.success++;
        console.log(`✅ Fila ${rowNumber} procesada exitosamente`);

      } catch (error) {
        const errorMsg = error.message || 'Error desconocido';
        console.error(`❌ Error en fila ${rowNumber}:`, errorMsg);
        console.error(`❌ Stack trace:`, error.stack);
        results.errors.push({
          row: rowNumber,
          error: errorMsg
        });
      }
    }

    // Eliminar archivo temporal
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Preparar respuesta
    const hasErrors = results.errors.length > 0;
    const hasSuccess = results.success > 0;
    
    console.log('📊 Resumen de procesamiento:', {
      total: results.total,
      success: results.success,
      errors: results.errors.length,
      hasErrors,
      hasSuccess
    });

    // Si hay errores, devolver status 207 (Multi-Status) o 200 con información de errores
    const statusCode = hasErrors && !hasSuccess ? 400 : 200;
    
    res.status(statusCode).json({
      success: hasSuccess,
      message: hasSuccess 
        ? `Carga completada. ${results.success} alumnos cargados exitosamente${hasErrors ? `, ${results.errors.length} errores` : ''}.`
        : `No se pudieron cargar alumnos. ${results.errors.length} errores encontrados.`,
      data: results
    });

  } catch (error) {
    console.error('Error cargando alumnos desde Excel:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener un estudiante por ID
 */
exports.getStudentById = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID del estudiante es requerido' 
      });
    }

    const student = await Student.findById(studentId)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    const tutors = await Shared.find({
      student: studentId,
      status: 'active'
    })
    .populate('user', 'name email dni')
    .populate('role', 'nombre descripcion');

    const tutorInfo = {
      familyadmin: null,
      familyviewer: null
    };

    tutors.forEach(tutor => {
      if (tutor.role && tutor.user) {
        if (tutor.role.nombre === 'familyadmin') {
          tutorInfo.familyadmin = {
            _id: tutor.user._id,
            name: tutor.user.name,
            email: tutor.user.email,
            dni: tutor.user.dni || null
          };
        } else if (tutor.role.nombre === 'familyviewer') {
          tutorInfo.familyviewer = {
            _id: tutor.user._id,
            name: tutor.user.name,
            email: tutor.user.email,
            dni: tutor.user.dni || null
          };
        }
      }
    });

    res.json({
      success: true,
      data: {
        _id: student._id,
        nombre: student.nombre,
        apellido: student.apellido,
        dni: student.dni,
        email: student.email,
        account: student.account,
        division: student.division,
        tutor: tutorInfo,
        qrCode: student.qrCode
      }
    });

  } catch (error) {
    console.error('❌ [STUDENT BY ID] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener estudiantes por división
 */
exports.getStudentsByDivision = async (req, res) => {
  try {
    const { divisionId } = req.params;
    
    const students = await Student.find({ division: divisionId })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .sort({ apellido: 1, nombre: 1 });
    
    res.json({
      success: true,
      data: students
    });
  } catch (error) {
    console.error('Error al obtener estudiantes por división:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Actualizar avatar de estudiante
 */
exports.updateStudentAvatar = async (req, res) => {
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] Petición recibida');
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] Student ID:', req.params.studentId);
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] File:', req.file);
  
  try {
    const { studentId } = req.params;
    const userId = req.user._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    }).populate('role');

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar este estudiante'
      });
    }

    if (userAssociation.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los familyadmin pueden actualizar avatares de estudiantes'
      });
    }

    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    const avatarKey = req.file.key;
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { 
        avatar: avatarKey,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    const signedUrl = await generateSignedUrl(avatarKey, 172800);

    res.json({
      success: true,
      message: 'Avatar del estudiante actualizado exitosamente',
      data: {
        student: {
          _id: updatedStudent._id,
          nombre: updatedStudent.nombre,
          apellido: updatedStudent.apellido,
          avatar: signedUrl
        }
      }
    });

  } catch (error) {
    console.error('Error actualizando avatar del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Eliminar estudiante
 */
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: student.account,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar este alumno'
      });
    }

    await Student.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Alumno eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando alumno:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Generar códigos QR para estudiantes
 */
exports.generateQRCodes = async (req, res) => {
  try {
    const { accountId, divisionId } = req.body;
    
    if (!accountId || !divisionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'accountId y divisionId son requeridos' 
      });
    }

    const studentsWithoutQR = await Student.find({
      account: accountId,
      division: divisionId,
      $or: [
        { qrCode: { $exists: false } },
        { qrCode: null },
        { qrCode: '' }
      ]
    });

    console.log(`🔍 [QR GENERATION] Estudiantes sin QR encontrados: ${studentsWithoutQR.length}`);

    let generatedCount = 0;
    const results = [];

    for (const student of studentsWithoutQR) {
      try {
        let qrCode;
        let attempts = 0;
        const maxAttempts = 10;

        do {
          qrCode = student.generateQRCode();
          attempts++;
          
          const existingStudent = await Student.findOne({ qrCode });
          if (!existingStudent) {
            break;
          }
        } while (attempts < maxAttempts);

        if (attempts >= maxAttempts) {
          console.error(`❌ [QR GENERATION] No se pudo generar código único para estudiante ${student._id}`);
          results.push({
            studentId: student._id,
            studentName: student.getFullName(),
            success: false,
            error: 'No se pudo generar código único'
          });
          continue;
        }

        student.qrCode = qrCode;
        await student.save();

        generatedCount++;
        results.push({
          studentId: student._id,
          studentName: student.getFullName(),
          qrCode: qrCode,
          success: true
        });

        console.log(`✅ [QR GENERATION] Código generado para ${student.getFullName()}: ${qrCode}`);

      } catch (error) {
        console.error(`❌ [QR GENERATION] Error generando QR para estudiante ${student._id}:`, error);
        results.push({
          studentId: student._id,
          studentName: student.getFullName(),
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalProcessed: studentsWithoutQR.length,
        generatedCount: generatedCount,
        results: results
      }
    });

  } catch (error) {
    console.error('❌ [QR GENERATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Buscar estudiante por código QR
 */
exports.getStudentByQR = async (req, res) => {
  try {
    const { qrCode } = req.params;
    
    if (!qrCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Código QR es requerido' 
      });
    }

    const student = await Student.findOne({ qrCode })
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        _id: student._id,
        nombre: student.nombre,
        apellido: student.apellido,
        dni: student.dni,
        email: student.email,
        account: student.account,
        division: student.division,
        qrCode: student.qrCode
      }
    });

  } catch (error) {
    console.error('❌ [QR SEARCH] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Listar coordinadores
 */
exports.listCoordinators = async (req, res) => {
  try {
    const { userId } = req.user;

    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      currentUser = await User.findById(userId).populate('role');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver coordinadores'
      });
    }

    let query = {
      status: 'active'
    };

    if (currentUser.role?.nombre === 'adminaccount') {
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
      } else {
        query.account = null;
      }
    }

    const coordinadorAssociations = await Shared.find(query).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'account',
        select: 'nombre razonSocial'
      },
      {
        path: 'division',
        select: 'nombre descripcion'
      }
    ]);

    const coordinadores = coordinadorAssociations.filter(association => 
      association.role?.nombre === 'coordinador' && association.user
    );

    res.json({
      success: true,
      data: {
        coordinadores: coordinadores.map(association => ({
          _id: association.user._id,
          nombre: association.user.name,
          email: association.user.email,
          activo: association.user.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          division: association.division ? {
            _id: association.division._id,
            nombre: association.division.nombre,
            descripcion: association.division.descripcion
          } : null,
          account: association.account ? {
            _id: association.account._id,
            nombre: association.account.nombre,
            razonSocial: association.account.razonSocial
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo coordinadores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener coordinadores por división
 */
exports.getCoordinatorsByDivision = async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { userId } = req.user;

    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      currentUser = await User.findById(userId).populate('role');
    }

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver coordinadores'
      });
    }

    const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    if (!coordinadorRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de coordinador no encontrado'
      });
    }

    const associations = await Shared.find({
      division: divisionId,
      role: coordinadorRole._id,
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      }
    ]);

    // Filtrar asociaciones que tienen usuario (populate puede retornar null)
    const filteredAssociations = associations.filter(association => association.user);

    res.json({
      success: true,
      data: {
        coordinadores: filteredAssociations.map(association => ({
          _id: association.user._id,
          nombre: association.user.name,
          email: association.user.email,
          activo: association.user.status === 'approved',
          asociacionId: association._id
        }))
      }
    });

  } catch (error) {
    const logger = require('../utils/logger');
    logger.error('Error obteniendo coordinadores por división', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener template de Excel para coordinadores
 */
exports.getCoordinatorsTemplate = async (req, res) => {
  try {
    const templateData = [
      ['Nombre', 'Email', 'DNI'],
      ['Juan Pérez', 'juan.perez@email.com', '12345678'],
      ['María García', 'maria.garcia@email.com', '23456789']
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    worksheet['!cols'] = [
      { width: 20 },
      { width: 30 },
      { width: 12 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Coordinadores');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_coordinadores.xlsx"');
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Error generando plantilla de coordinadores:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla de coordinadores'
    });
  }
};

/**
 * Subir coordinadores desde Excel
 */
exports.uploadCoordinatorsExcel = async (req, res) => {
  try {
    console.log('📁 [COORDINATORS UPLOAD] Iniciando carga de coordinadores...');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ningún archivo'
      });
    }

    const { userId } = req.user;
    const { divisionId } = req.body;

    if (!divisionId) {
      return res.status(400).json({
        success: false,
        message: 'ID de división es requerido'
      });
    }

    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cargar coordinadores'
      });
    }

    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociation = await Shared.findOne({
        user: currentUser._id,
        account: division.cuenta,
        status: 'active'
      });

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para cargar coordinadores en esta división'
        });
      }
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'El archivo debe contener al menos una fila de datos (excluyendo encabezados)'
      });
    }

    const results = {
      success: 0,
      errors: []
    };

    const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    if (!coordinadorRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de coordinador no encontrado en el sistema'
      });
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;

      try {
        const isRowEmpty = !row[0] && !row[1] && !row[2];
        if (isRowEmpty) {
          continue;
        }

        const nombre = String(row[0] || '').trim();
        const email = String(row[1] || '').toLowerCase().trim();
        const dni = String(row[2] || '').trim();

        if (!nombre || !email || !dni) {
          const missingFields = [];
          if (!nombre) missingFields.push('nombre');
          if (!email) missingFields.push('email');
          if (!dni) missingFields.push('dni');
          
          results.errors.push({
            row: rowNumber,
            error: `Faltan campos requeridos: ${missingFields.join(', ')}`
          });
          continue;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          results.errors.push({
            row: rowNumber,
            error: 'Formato de email inválido'
          });
          continue;
        }

        const existingCoordinator = await User.findOne({
          $or: [
            { email: email },
            { dni: dni }
          ]
        });

        let coordinatorUser = null;

        if (existingCoordinator) {
          coordinatorUser = existingCoordinator;
        } else {
          const coordinatorPassword = generateRandomPassword(12);
          const coordinatorData = {
            name: nombre,
            email: email,
            password: coordinatorPassword,
            role: coordinadorRole._id,
            status: 'approved',
            dni: dni
          };

          coordinatorUser = new User(coordinatorData);
          await coordinatorUser.save();

          const institutionName = division.cuenta ? (await Account.findById(division.cuenta)).nombre : 'Institución';
          await sendNewUserCreatedEmailToQueue(
            {
              name: coordinatorUser.name,
              email: coordinatorUser.email
            },
            coordinatorData.password,
            institutionName,
            'coordinador'
          );
        }

        const existingCoordinatorAssociation = await Shared.findOne({
          user: coordinatorUser._id,
          account: division.cuenta,
          division: divisionId,
          role: coordinadorRole._id,
          status: 'active'
        });

        if (!existingCoordinatorAssociation) {
          await createAssociationByRole(
            coordinatorUser._id,
            division.cuenta,
            'coordinador',
            divisionId,
            null,
            userId
          );

          if (existingCoordinator) {
            try {
              const account = await Account.findById(division.cuenta);
              await sendInstitutionAssociationEmailToQueue(
                {
                  name: coordinatorUser.name,
                  email: coordinatorUser.email
                },
                account.nombre,
                division.nombre,
                'Coordinador'
              );
            } catch (emailError) {
              console.error(`Error enviando email de asociación:`, emailError.message);
            }
          }
        }

        results.success++;

      } catch (error) {
        console.log(`❌ Error en fila ${rowNumber}:`, error.message);
        results.errors.push({
          row: rowNumber,
          error: error.message
        });
      }
    }

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Carga completada. ${results.success} coordinadores cargados exitosamente.`,
      data: results
    });

  } catch (error) {
    console.error('Error cargando coordinadores desde Excel:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Listar tutores
 */
exports.listTutors = async (req, res) => {
  try {
    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      const { userId } = req.user;
      currentUser = await User.findById(userId).populate('role');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver tutores'
      });
    }

    let query = {
      status: 'active'
    };

    if (currentUser.role?.nombre === 'adminaccount') {
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
      } else {
        query.account = null;
      }
    }

    const tutorAssociations = await Shared.find(query).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'account',
        select: 'nombre razonSocial'
      },
      {
        path: 'division',
        select: 'nombre descripcion'
      },
      {
        path: 'student',
        select: 'nombre apellido'
      }
    ]);

    const tutores = tutorAssociations.filter(association => 
      (association.role?.nombre === 'familyadmin' || association.role?.nombre === 'familyviewer') && association.user
    );

    res.json({
      success: true,
      data: {
        tutores: tutores.map(association => ({
          _id: association.user._id,
          nombre: association.user.name,
          email: association.user.email,
          activo: association.user.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          division: association.division ? {
            _id: association.division._id,
            nombre: association.division.nombre,
            descripcion: association.division.descripcion
          } : null,
          account: association.account ? {
            _id: association.account._id,
            nombre: association.account.nombre,
            razonSocial: association.account.razonSocial
          } : null,
          student: association.student ? {
            _id: association.student._id,
            nombre: association.student.nombre,
            apellido: association.student.apellido
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo tutores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener tutores por división
 */
exports.getTutorsByDivision = async (req, res) => {
  try {
    const { divisionId } = req.params;

    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      const { userId } = req.user;
      currentUser = await User.findById(userId).populate('role');
    }

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver tutores'
      });
    }

    const tutorRoles = await Role.find({ nombre: { $in: ['familyadmin', 'familyviewer'] } });
    const tutorRoleIds = tutorRoles.map(role => role._id);

    const associations = await Shared.find({
      division: divisionId,
      role: { $in: tutorRoleIds },
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'student',
        select: 'nombre apellido'
      }
    ]).filter(association => association.user);

    res.json({
      success: true,
      data: {
        tutores: associations.map(association => ({
          _id: association.user._id,
          nombre: association.user.name,
          email: association.user.email,
          activo: association.user.status === 'approved',
          asociacionId: association._id,
          role: association.role ? {
            _id: association.role._id,
            nombre: association.role.nombre
          } : null,
          student: association.student ? {
            _id: association.student._id,
            nombre: association.student.nombre,
            apellido: association.student.apellido
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo tutores por división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};
