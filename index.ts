import { inject, injectable } from "tsyringe";
import AppError from "@shared/errors/AppError";
import IEmployeeServicesRepository from "@modules/employees/repositories/IEmployeeServicesRepository";
import EmployeeService from "@modules/employees/infra/typeorm/entities/EmployeeService";
import IEmployeesRepository from "../repositories/IEmployeesRepository";
import IAppointmentsRepository from "@modules/appointments/repositories/IAppointmentsRepository";
import {
  addHours,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  format,
  isBefore,
  parse,
  startOfDay,
} from "date-fns";
import { instanceToInstance } from "class-transformer";
import ITimeZonesRepository from "@modules/timezones/repositories/ITimeZonesRepository";
import ICompaniesRepository from "@modules/companies/repositories/ICompaniesRepository";
import { toDate, utcToZonedTime, format as formatTz } from "date-fns-tz";
import enGB from "date-fns/locale/en-GB";

interface IEmployeesEntity {
  id: string;
  name: string;
  photo_url: string;
}

interface IEmployees {
  id: string;
  name: string;
  photo_url: string;
  service_time: string;
  initial_date: string;
  final_date: string;
}

interface ITimeWork {
  initial_time: string;
  final_time: string;
}

interface IdaysWork {
  day: string;
  description: string;
  confirm: boolean;
  time_work: ITimeWork[];
}

interface IFilter {
  employee_id?: string;
  date_filter?: string;
}

@injectable()
class ShowTimeEmployeesService {
  constructor(
    @inject("EmployeesRepository")
    private employeesRepository: IEmployeesRepository,
    @inject("EmployeeServicesRepository")
    private employeeServicesRepository: IEmployeeServicesRepository,
    @inject("AppointmentsRepository")
    private appointmentsRepository: IAppointmentsRepository,
    @inject("TimeZonesRepository")
    private timezonesRepository: ITimeZonesRepository,
    @inject("CompaniesRepository")
    private companiesRepository: ICompaniesRepository
  ) {}

  public handleCalcDate(
    date: Date,
    timeZone: string,
    formated: string = "yyyy-MM-dd HH:mm:ss"
  ): Date {
    const formattedDateNow = formatTz(utcToZonedTime(date, timeZone), formated);
    const dateNowFormated = new Date(formattedDateNow);
    const timezoneOffsetFormated = dateNowFormated.getTimezoneOffset();
    // dateNowFormated.setMinutes(
    //   dateNowFormated.getMinutes() - timezoneOffsetFormated,
    // );

    return dateNowFormated;
  }

  public async execute(
    company_id: string,
    service_id: string,
    filter: IFilter
  ) {
    let response: any = {};

    let { employee_id } = filter;
    let { date_filter } = filter;

    if (employee_id === "all") employee_id = undefined;

    const employees = await this.employeesRepository.findAllActive(
      company_id,
      employee_id
    );

    if (!service_id) {
      throw new AppError("Serviço não informado.");
    }

    const checkCompanyIsActive = await this.companiesRepository.findById(
      company_id
    );

    if (!checkCompanyIsActive || !checkCompanyIsActive.active) {
      throw new AppError("Empresa não esta ativa no momento.");
    }

    let timeZone = "America/Sao_Paulo";
    const checkTimeZoneExists = await this.timezonesRepository.findById(
      checkCompanyIsActive.time_zone_id
    );

    if (checkTimeZoneExists) {
      timeZone = checkTimeZoneExists.value;
    }

    // const formattedDateNow = formatTz(
    //   utcToZonedTime(new Date(), timeZone),
    //   'yyyy-MM-dd HH:mm:ss',
    // );
    // const dateNowFormated = new Date(formattedDateNow);
    // const timezoneOffsetFormated = dateNowFormated.getTimezoneOffset();
    // dateNowFormated.setMinutes(
    //   dateNowFormated.getMinutes() - timezoneOffsetFormated,
    // );

    const dateNowFormated = this.handleCalcDate(new Date(), timeZone);

    // if (
    //   isBefore(
    //     dateNowFormated,
    //     new Date(formatTz(utcToZonedTime(new Date(), timeZone), 'yyyy-MM-dd')),
    //   )
    // ) {
    //   return {};
    // }

    let dateNow = dateNowFormated;
    if (date_filter) dateNow = new Date(`${date_filter}T00:00:00.000`);

    const initial_date = format(startOfDay(new Date()), "yyyy-MM-dd HH:mm:ss");
    const final_date = format(endOfDay(new Date()), "yyyy-MM-dd HH:mm:ss");

    const dayOfTheWeek = formatTz(utcToZonedTime(dateNow, timeZone), "EEEE");

    for await (const employeeItem of employees) {
      const employee: any = instanceToInstance(employeeItem);

      const employeeService =
        await this.employeeServicesRepository.findByEmployeeService(
          employee.id,
          service_id
        );

      if (!employeeService) continue;

      const duration = JSON.parse(employeeService.duration as any);
      let hours = duration.hours;
      let minutes = duration.minutes;

      if (minutes >= 60) {
        const newHours = Math.floor(minutes / 60);
        minutes = minutes - newHours * 60;
        hours = hours + newHours;
      }

      const durationInMinutes = minutes + hours * 60;

      const dayWork = JSON.parse(employeeService.days_work as any).find(
        (dayWork: IdaysWork) => {
          if (
            dayWork.confirm &&
            dayWork.day === dayOfTheWeek.toLocaleLowerCase()
          ) {
            return dayWork;
          }
        }
      );

      if (!dayWork) continue;

      for (const timeWork of dayWork.time_work) {
        const initialTimeConvertToArray = timeWork.initial_time.split(":");
        const finalTimeConvertToArray = timeWork.final_time.split(":");

        let initialHour =
          initialTimeConvertToArray[0][0] === "0"
            ? initialTimeConvertToArray[0][1]
            : initialTimeConvertToArray[0];

        let initialMinute =
          initialTimeConvertToArray[1][0] === "0"
            ? initialTimeConvertToArray[1][1]
            : initialTimeConvertToArray[1];

        let finalHour =
          finalTimeConvertToArray[0][1] === "0"
            ? finalTimeConvertToArray[0][1]
            : finalTimeConvertToArray[0];

        let finalMinute =
          finalTimeConvertToArray[1][1] === "0"
            ? finalTimeConvertToArray[1][1]
            : finalTimeConvertToArray[1];

        const diffInMinutes = differenceInMinutes(
          new Date(2023, 6, 2, finalHour, finalMinute, 0),
          new Date(2023, 6, 2, initialHour, initialMinute, 0)
        );

        const countForTheTime = Math.floor(diffInMinutes / durationInMinutes);

        let startHour = initialTimeConvertToArray[0];
        let startMinute = initialTimeConvertToArray[1];
        let endHour = initialTimeConvertToArray[0];
        let endMinute = initialTimeConvertToArray[1];
        if (parseInt(startMinute) + durationInMinutes >= 60) {
          const moreHour = Math.floor(
            (parseInt(startMinute) + durationInMinutes) / 60
          );
          endHour = parseInt(startHour) + moreHour;

          endMinute = durationInMinutes + parseInt(startMinute) - moreHour * 60;
        } else {
          endMinute = parseInt(startMinute) + durationInMinutes;
        }

        for (let i = 1; i <= countForTheTime; i++) {
          const hourNow = `${
            startHour.toString().length === 1 ? "0" + startHour : startHour
          }:${
            startMinute.toString().length === 1
              ? "0" + startMinute
              : startMinute
          }`;
          let addInList = true;
          const a = new Date(`${date_filter} ${hourNow}:00.000`);
          console.log(a);
          console.log(dateNowFormated);

          if (
            isBefore(
              new Date(`${date_filter} ${hourNow}:00.000`),
              dateNowFormated
            )
          ) {
            addInList = false;
          }

          // verificar se ja passou da hora e dar um continue
          const employeeValue = {
            id: employee.id,
            name: employee.name,
            photo_url: employee.photo_url,
            service_time: `${hours ? hours : "00"}:${minutes ? minutes : "00"}`,
            initial_date: `${
              startHour.toString().length === 1 ? "0" + startHour : startHour
            }:${
              startMinute.toString().length === 1
                ? "0" + startMinute
                : startMinute
            }`,
            final_date: `${
              endHour.toString().length === 1 ? "0" + endHour : endHour
            }:${
              endMinute.toString().length === 1 ? "0" + endMinute : endMinute
            }`,
          };

          const appointments = await this.appointmentsRepository.findByDate(
            employee.id,
            `${date_filter} ${employeeValue.initial_date}`,
            `${date_filter} ${employeeValue.final_date}`
          );

          if (addInList && !appointments) {
            if (response[employeeValue.initial_date]) {
              response[employeeValue.initial_date] = [
                employeeValue,
                ...response[employeeValue.initial_date],
              ];
            } else {
              response[employeeValue.initial_date] = [employeeValue];
            }
          }

          startHour = endHour.toString().length === 1 ? "0" + endHour : endHour;
          startMinute =
            endMinute.toString().length === 1 ? "0" + endMinute : endMinute;

          if (parseInt(startMinute) + durationInMinutes >= 60) {
            const moreHour = Math.floor(
              (parseInt(startMinute) + durationInMinutes) / 60
            );
            endHour = parseInt(startHour) + moreHour;

            endMinute =
              durationInMinutes + parseInt(startMinute) - moreHour * 60;
          } else {
            endMinute = parseInt(startMinute) + durationInMinutes;
          }
        }
      }
    }

    return response;
  }
}

export default ShowTimeEmployeesService;
