document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    document.getElementById('generateBtn').addEventListener('click', generateSQL);
});

function parseFields(text) {
  return text.split(',').map(line => line.trim()).filter(Boolean);
}

function generateSQL() {
    saveToLocalStorage();
    const projectSrc = document.getElementById('projectSrc').value.trim();
    const projectDst = document.getElementById('projectDst').value.trim() || projectSrc;
    const datasetSrc = document.getElementById('datasetSrc').value.trim();
    const datasetDst = document.getElementById('datasetDst').value.trim() || datasetSrc;
    const tableSrc = document.getElementById('tableSrc').value.trim();
    const tableDst = document.getElementById('tableDst').value.trim();
    const filterSrc = document.getElementById('filterSrc').value.trim();
    const filterDst = document.getElementById('filterDst').value.trim();
    const fields = parseFields(document.getElementById('fields').value);
    const keyField = document.getElementById('keyField').value.trim();
    const outputContainer = document.getElementById('output');
    const loader = document.querySelector('.loader');

    if (!projectSrc || !datasetSrc || !tableSrc) {
        showNotification('Por favor, completa los campos requeridos: Proyecto Origen, Dataset Origen y Tabla Origen.', 'error');
        return;
    }

    loader.style.display = 'inline-block';
    outputContainer.innerHTML = '';

    const whereSrc = filterSrc ? `WHERE ${filterSrc}` : '';
    const whereDst = filterDst ? `WHERE ${filterDst}` : '';

    setTimeout(() => {
        let sqls = [];

        sqls.push({
            title: '1️⃣ Cantidad de registros (Origen)',
            query: `SELECT '${tableSrc}' AS tabla, COUNT(*) AS registros FROM \`${projectSrc}.${datasetSrc}.${tableSrc}\` ${whereSrc};`
        });

        if (tableDst) {
            sqls.push({
                title: '1️⃣ Cantidad de registros (Destino)',
                query: `SELECT '${tableDst}' AS tabla, COUNT(*) AS registros FROM \`${projectDst}.${datasetDst}.${tableDst}\` ${whereDst};`
            });

            sqls.push({
                title: '2️⃣ Comparación de esquemas (estructura y tipo de dato)',
                query: `WITH schema_src AS (\n  SELECT column_name, data_type, is_nullable\n  FROM \`${projectSrc}.${datasetSrc}.INFORMATION_SCHEMA.COLUMNS\`\n  WHERE table_name = '${tableSrc}'\n), schema_dst AS (\n  SELECT column_name, data_type, is_nullable\n  FROM \`${projectDst}.${datasetDst}.INFORMATION_SCHEMA.COLUMNS\`\n  WHERE table_name = '${tableDst}'\n)\nSELECT\n  COALESCE(src.column_name, dst.column_name) AS columna,\n  src.data_type AS tipo_origen,\n  dst.data_type AS tipo_destino,\n  src.is_nullable AS nullable_origen,\n  dst.is_nullable AS nullable_destino\nFROM schema_src src\nFULL OUTER JOIN schema_dst dst ON src.column_name = dst.column_name\nWHERE src.data_type != dst.data_type OR src.is_nullable != dst.is_nullable OR src.column_name IS NULL OR dst.column_name IS NULL;`
            });
        }

        if (keyField) {
            const keys = keyField.split(',').map(k => k.trim()).join(', ');
            sqls.push({
                title: '3️⃣ Duplicados en Clave Primaria (Origen)',
                query: `SELECT ${keys}, COUNT(*) AS num_duplicados\nFROM \`${projectSrc}.${datasetSrc}.${tableSrc}\` ${whereSrc}\nGROUP BY ${keys}\nHAVING COUNT(*) > 1;`
            });
            if (tableDst) {
                sqls.push({
                    title: '4️⃣ Duplicados en Clave Primaria (Destino)',
                    query: `SELECT ${keys}, COUNT(*) AS num_duplicados\nFROM \`${projectDst}.${datasetDst}.${tableDst}\` ${whereDst}\nGROUP BY ${keys}\nHAVING COUNT(*) > 1;`
                });
            }
        }

        if (tableDst && keyField && fields.length > 0) {
            const joinCondition = keyField.split(',').map(k => `src.${k.trim()} = dst.${k.trim()}`).join(' AND ');
            const fieldComparisons = fields.map(f => `(SAFE_CAST(src.${f} AS STRING) IS NOT DISTINCT FROM SAFE_CAST(dst.${f} AS STRING))`).join(' AND\n      ');

            const filterConditions = [];
            if (filterSrc) filterConditions.push(`(${filterSrc})`);
            if (filterDst) filterConditions.push(`(${filterDst})`);
            const combinedWhere = filterConditions.length > 0 ? `\nWHERE ${filterConditions.join(' AND ')}` : '';

            sqls.push({
                title: '5️⃣ Validación campo a campo',
                query: `SELECT\n  '${tableSrc}' AS tabla_origen,\n  '${tableDst}' AS tabla_destino,\n  COUNT(*) AS total_filas,\n  COUNTIF(NOT (${fieldComparisons})) AS filas_con_inconsistencias\nFROM \`${projectSrc}.${datasetSrc}.${tableSrc}\` src\nJOIN \`${projectDst}.${datasetDst}.${tableDst}\` dst ON ${joinCondition}${combinedWhere};`
            });
        }

        if(tableDst){
             sqls.push({
                title: '6️⃣ Orden de columnas',
                query: `SELECT src.ordinal_position, src.column_name AS col_origen, dst.column_name AS col_destino\nFROM \`${projectSrc}.${datasetSrc}.INFORMATION_SCHEMA.COLUMNS\` src\nJOIN \`${projectDst}.${datasetDst}.INFORMATION_SCHEMA.COLUMNS\` dst\n  ON src.ordinal_position = dst.ordinal_position\nWHERE src.table_name='${tableSrc}' AND dst.table_name='${tableDst}'\n  AND src.column_name != dst.column_name;`
            });
        }

        renderSQLs(sqls);
        loader.style.display = 'none';
    }, 500);
}

function renderSQLs(sqls) {
    const outputContainer = document.getElementById('output');
    outputContainer.innerHTML = sqls.map((s, index) => `
        <div class="sql-output">
            <button class="copy-btn" onclick="copyToClipboard('sql-${index}')"><i class="far fa-copy"></i> Copiar</button>
            <strong>${s.title}</strong>
            <pre id="sql-${index}">${s.query}</pre>
        </div>
    `).join('');
}

function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copiado al portapapeles!');
    }).catch(err => {
        showNotification('Error al copiar.', 'error');
        console.error('Error al copiar: ', err);
    });
}

function saveToLocalStorage() {
    const data = {
        projectSrc: document.getElementById('projectSrc').value,
        projectDst: document.getElementById('projectDst').value,
        datasetSrc: document.getElementById('datasetSrc').value,
        datasetDst: document.getElementById('datasetDst').value,
        tableSrc: document.getElementById('tableSrc').value,
        tableDst: document.getElementById('tableDst').value,
        filterSrc: document.getElementById('filterSrc').value,
        filterDst: document.getElementById('filterDst').value,
        fields: document.getElementById('fields').value,
        keyField: document.getElementById('keyField').value
    };
    localStorage.setItem('sqlGeneratorData', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const data = JSON.parse(localStorage.getItem('sqlGeneratorData'));
    if (data) {
        document.getElementById('projectSrc').value = data.projectSrc || '';
        document.getElementById('projectDst').value = data.projectDst || '';
        document.getElementById('datasetSrc').value = data.datasetSrc || '';
        document.getElementById('datasetDst').value = data.datasetDst || '';
        document.getElementById('tableSrc').value = data.tableSrc || '';
        document.getElementById('tableDst').value = data.tableDst || '';
        document.getElementById('filterSrc').value = data.filterSrc || '';
        document.getElementById('filterDst').value = data.filterDst || '';
        document.getElementById('fields').value = data.fields || '';
        document.getElementById('keyField').value = data.keyField || '';
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.backgroundColor = type === 'error' ? '#e74c3c' : '#2ecc71';
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}
