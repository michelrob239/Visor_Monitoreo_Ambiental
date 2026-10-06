from fastapi import APIRouter

from database import obtener_capa, obtener_mediciones

router = APIRouter()

@router.get("/distritos")
def distritos():

    return obtener_capa("distritos_lima_metropolitana")


@router.get("/rios")
def rios():

    return obtener_capa("rios_lima_metropolitana")


@router.get("/estaciones")
def estaciones():

    return obtener_capa("estaciones_monitoreo")


@router.get("/mediciones/{estacion_id}")
def mediciones(estacion_id: int):

    return obtener_mediciones(estacion_id)