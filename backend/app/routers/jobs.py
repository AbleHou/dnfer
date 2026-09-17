from fastapi import APIRouter, Depends

from .. import jobs as job_data
from ..auth import get_current_user
from ..models import User
from ..schemas import JobCategory

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

@router.get("", response_model=list[JobCategory])
def list_jobs(user: User = Depends(get_current_user)):
    return job_data.job_tree()
