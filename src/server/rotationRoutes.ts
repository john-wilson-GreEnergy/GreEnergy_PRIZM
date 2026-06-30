import express from 'express';
import { executeRotationCommand, setStringRotation, setPcsRotation } from './rotationControlService';

export const rotationRouter = express.Router();

rotationRouter.get('/capabilities', (req, res) => {
    res.json({
        "strings": {
            "single": true,
            "array": true,
            "method": "GET",
            "executor": "turtle-controls-ems"
        },
        "pcs": {
            "single": true,
            "array": true,
            "method": "GET",
            "executor": "turtle-controls-ems"
        },
        "contactors": {
            "strings": true,
            "array": true,
            "phoenixDirect": true,
            "alarmOverrideFlags": true
        }
    });
});

rotationRouter.get('/rotation/capabilities', (req, res) => {
    res.json({
        "strings": {
            "single": true,
            "array": true,
            "method": "GET",
            "executor": "turtle-controls-ems"
        },
        "pcs": {
            "single": true,
            "array": true,
            "method": "GET",
            "executor": "turtle-controls-ems"
        },
        "contactors": {
            "strings": true,
            "array": true,
            "phoenixDirect": true,
            "alarmOverrideFlags": true
        }
    });
});

rotationRouter.post('/strings/rotation', async (req, res) => {
    try {
        const result = await setStringRotation(req.body);
        res.json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

rotationRouter.post('/pcs/rotation', async (req, res) => {
    try {
        const result = await setPcsRotation(req.body);
        res.json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});