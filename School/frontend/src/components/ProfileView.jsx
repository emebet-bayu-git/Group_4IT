import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { readSessionToken, updateSessionToken } from '../pages/LoginPage.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const emptyProfile = {
  name: '',
  email: '',
  phone: '',
  department: '',
  role: '',
}

function authConfig() {
  return { headers: { Authorization: `Bearer ${readSessionToken()}` } }
}

export default function ProfileView({ open, onClose, onProfileUpdated }) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState(emptyProfile)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!photoPreview) return undefined
    return () => URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  useEffect(() => {
    if (!open) return undefined
    let active = true
    setLoading(true)
    setProfileLoaded(false)
    setSelectedPhoto(null)
    setPhotoPreview('')
    axios.get('/api/auth/profile', authConfig())
      .then(({ data }) => {
        if (active) {
          setProfile({ ...emptyProfile, ...data })
          setProfileLoaded(true)
        }
      })
      .catch((requestError) => {
        if (active) toast.error(t(requestError.response?.data?.message || 'Unable to load your profile.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [open])

  const update = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  const selectPhoto = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error(t('Choose a JPEG or PNG image.'))
      setSelectedPhoto(null)
      setPhotoPreview('')
      event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('Profile photos must be 5 MB or smaller.'))
      setSelectedPhoto(null)
      setPhotoPreview('')
      event.target.value = ''
      return
    }
    setSelectedPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const save = async (event) => {
    event.preventDefault()
    if (newPassword && newPassword !== confirmPassword) {
      toast.error(t('The new passwords do not match.'))
      return
    }
    if (!newPassword && currentPassword) {
      toast.error(t('Enter a new password or clear the current password field.'))
      return
    }
    setSaving(true)
    try {
      const request = new FormData()
      request.append('name', profile.name)
      request.append('email', profile.email)
      request.append('phone', profile.phone || '')
      request.append('department', profile.department || '')
      if (selectedPhoto) request.append('profilePhoto', selectedPhoto)
      if (newPassword) {
        request.append('currentPassword', currentPassword)
        request.append('newPassword', newPassword)
      }
      const { data } = await axios.put('/api/auth/profile', request, authConfig())
      if (data.token) updateSessionToken(data.token)
      setProfile({ ...emptyProfile, ...data.profile })
      setSelectedPhoto(null)
      setPhotoPreview('')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t('Your profile has been updated.'))
      onProfileUpdated?.(data.profile)
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to update your profile.'))
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('My Profile')}
      description={t('View and update your staff account details.')}
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="staff-profile-form" loading={saving} disabled={loading || !profileLoaded}>{t('Save changes')}</Button>
        </>
      )}
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <p role="status" className="py-6 text-center text-sm text-slate-500">{t('Loading your profile…')}</p>
        ) : !profileLoaded ? (
          <p className="py-6 text-center text-sm text-slate-600">{t('Unable to load your profile.')}</p>
        ) : (
          <form id="staff-profile-form" onSubmit={save} className="space-y-4">
            <div className="flex flex-col items-center gap-3 border-b border-slate-200 pb-4">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-primary-100 text-2xl font-bold text-primary-800 ring-4 ring-slate-100">
                {photoPreview || profile.avatarPath
                  ? <img src={photoPreview || profile.avatarPath} alt={`${profile.name} profile`} className="h-full w-full object-cover" />
                  : profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'}
              </div>
              <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {t('Upload Photo')}
                <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={selectPhoto} />
              </label>
              <p className="text-xs text-slate-500">{t('JPEG or PNG, up to 5 MB.')}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{t('Full name')}
                <input required maxLength={100} autoComplete="name" className={fieldClass} value={profile.name} onChange={(event) => update('name', event.target.value)} />
              </label>
              <label className="block text-sm font-medium text-slate-700">{t('Email')}
                <input required type="email" maxLength={100} autoComplete="email" className={fieldClass} value={profile.email} onChange={(event) => update('email', event.target.value)} />
              </label>
              <label className="block text-sm font-medium text-slate-700">{t('Phone number')}
                <input type="tel" maxLength={40} autoComplete="tel" className={fieldClass} value={profile.phone || ''} onChange={(event) => update('phone', event.target.value)} />
              </label>
              <label className="block text-sm font-medium text-slate-700">{t('Department')}
                <input maxLength={100} className={fieldClass} value={profile.department || ''} onChange={(event) => update('department', event.target.value)} />
              </label>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <p className="text-sm font-semibold text-slate-800">{t('Change password')} <span className="font-normal text-slate-500">{t('(optional)')}</span></p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700 sm:col-span-2">{t('Current password')}
                  <input type="password" autoComplete="current-password" className={fieldClass} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-slate-700">{t('New password')}
                  <input type="password" autoComplete="new-password" minLength={8} maxLength={72} className={fieldClass} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-slate-700">{t('Confirm new password')}
                  <input type="password" autoComplete="new-password" minLength={8} maxLength={72} className={fieldClass} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </label>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
