'use strict';

/*
|--------------------------------------------------------------------------
| Media reference scanner
|--------------------------------------------------------------------------
|
| Decides whether a Cloudinary publicId is still used anywhere in MongoDB.
| It inspects the schema of EVERY registered model and finds every path named
| "publicId" (including nested sub-documents and arrays), so a new model with
| an image field is protected automatically. Order snapshots count as
| references too: an image shown in order history must not disappear.
|--------------------------------------------------------------------------
*/

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MODELS_DIR = path.join(__dirname, '..', 'models');

let modelsLoaded = false;
let cachedTargets = null;

function loadAllModels() {
  if (modelsLoaded) return;

  for (const file of fs.readdirSync(MODELS_DIR)) {
    if (file.endsWith('.js')) {
      require(path.join(MODELS_DIR, file));
    }
  }

  modelsLoaded = true;
}

function collectPaths(schema, prefix, out) {
  schema.eachPath((pathName, schemaType) => {
    const full = prefix ? `${prefix}.${pathName}` : pathName;

    if (pathName === 'publicId' || pathName.endsWith('.publicId')) {
      out.push(full);
      return;
    }

    if (schemaType.schema) {
      collectPaths(schemaType.schema, full, out);
    }
  });
}

/** [{ model, path }] for every model/path that stores a publicId. */
function referenceTargets() {
  if (cachedTargets) return cachedTargets;

  loadAllModels();

  const targets = [];

  for (const name of mongoose.modelNames()) {
    if (name === 'Media') continue;

    const model = mongoose.model(name);
    const paths = [];

    collectPaths(model.schema, '', paths);

    for (const p of paths) {
      targets.push({ model, path: p });
    }
  }

  cachedTargets = targets;
  return targets;
}

async function isReferenced(publicId) {
  for (const { model, path: p } of referenceTargets()) {
    const hit = await model.exists({ [p]: publicId });

    if (hit) {
      return { referenced: true, model: model.modelName, path: p };
    }
  }

  return { referenced: false };
}

module.exports = {
  isReferenced,
  referenceTargets,
  _resetCacheForTests() {
    cachedTargets = null;
  },
};
